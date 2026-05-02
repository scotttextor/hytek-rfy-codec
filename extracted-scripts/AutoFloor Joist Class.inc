Option Explicit
'******************************************************************************
'
'  AutoWall Stud Class.inc
'
'  Include file for Load bearing stud placement in wall
'  Utilises frame reference array passed as parameter
'
'  Created - 1st Mar 2001
'
'******************************************************************************

'******************************************************************************
'   Constants globals
'******************************************************************************

Const    pmNormal    =   0
Const    pmBack      =   1
Const    pmFwd       =   2
   
'******************************************************************************
'   Global instance of class
'******************************************************************************

Dim Joists
Set Joists = New TJoist

'******************************************************************************
'
'   TStud
'
'   Implements placement of studs using frame reference array
'   Accesses global Builder & CAD instances
'
'******************************************************************************

Class TJoist

Private tRefs
Private pmCode
Private Index
Private ETop
Private ELeft
Private EBottom
Private ERight

Public Sub Place
  Dim F, SP,EP, endPoint
  Dim Pos, EnvelopeIntersections, I

  CAD.DrawingExtents ETop, ELeft, EBottom, ERight

  '  Sort Frame references by value into local copy
  SortRefs

  '  Set placement method code - if any Ref > Length then work backwards
  '  if any < 0 then work forwards else work back from first Ref and then
  '  forwards. 
  SetCode

  '  Set start reference index - Index of first Ref value to use
  SetIndex
        
  With Builder
    '  pmBack - place studs from end back to start of stick, restart at each new Ref
    '  stop when passed start of stick
    CAD.AutoExtend = True
    CAD.ClipRef = drMID
    If pmCode = pmBack Then
      Do
        Pos = tRefs(Index)

        Index =Index - 1
        If Index < 0 Then
          endPoint = ELeft  
        Else
          endPoint = tRefs(Index)
        End If
        If endPoint < ELeft Then
          endPoint = ELeft
        End If

        Do
          EnvelopeIntersections = TM.EnvelopeAlongX(Pos, True)
          for I = 0 to ((UBound(EnvelopeIntersections) - 1) / 2)
            SP = EnvelopeIntersections(I * 2 + 1,0)
            EP = EnvelopeIntersections(I * 2, 0)
            PlaceJoist EP, SP, False
          next

          Pos = Pos - .Joist_Spacing
        Loop Until Pos <= endPoint

      Loop Until endPoint = ELeft
    Else

      '  pmNormal - place studs from first Ref back to start and then forwards, restarting at each
      '  new Ref value. stop when passed end of stick
            
      If pmCode = pmNormal Then
        Pos = tRefs(Index)
        Do
          EnvelopeIntersections = TM.EnvelopeAlongX(Pos, True)
          for I = 0 to ((UBound(EnvelopeIntersections) - 1) / 2)
              SP = EnvelopeIntersections(I * 2 + 1, 0)
              EP = EnvelopeIntersections(I * 2, 0)

              PlaceJoist EP, SP, False
          next

          Pos = Pos - .Joist_Spacing
        Loop Until Pos <= ELeft
      End If
      
      '  pmFwd - place studs forward from first Ref, restarting at each new Ref value
      '  stop when passed end of stick (also if pmNormal)
      Do
        Pos = tRefs(Index)
        If pmCode = pmNormal Then
          Pos = Pos + .Joist_Spacing
          pmCode = pmFwd
        End If

        Index = Index + 1
        If Index > UBound(tRefs) Then
          endPoint = ERight
        Else
          endPoint = tRefs(Index)
        End If 

        Do
          EnvelopeIntersections = TM.EnvelopeAlongX(Pos, True)
          for I = 0 to ((UBound(EnvelopeIntersections) - 1) / 2)
            SP = EnvelopeIntersections(I * 2 + 1, 0)
            EP = EnvelopeIntersections(I * 2, 0)
            PlaceJoist EP, SP, False
          next

          Pos = Pos + .Joist_Spacing
        Loop Until Pos >= endPoint

      Loop Until endPoint >= ERight
    End If
  End With           
End Sub

'  Place stud at Pos if not over end studs or a feature
'  flipped if flag set
    
Private Function PlaceJoist(StartPos,EndPos,Flipped)
  Dim A, F, I, StartID, EndID, P1, P2, Lintel, WindowTrimDist, Clearance

  With Builder
    Clearance = CAD.EndClearance
    I = -1
    P1 = Split(StartPos, ",")
    P2 = Split(EndPos, ",")
    If CAD.IsStick(StartPos) and CAD.IsStick(EndPos) then
      StartID = CAD.StickHit(StartPos)
      EndID = CAD.StickHit(EndPos)

      F = CAD.StickOverFeature(StartPos, EndPos)
            
      If Features.Count > 0 Then
                            
        If  F >= 0 Then
          A = Features.Items    
          If p1(0) - (A(F).FOffset + A(F).FWidth - CAD.StudElevationWidth) < 0 AND (A(F).FOffset + CAD.StudElevationWidth) - P1(0) < 0 Then
            CAD.AutoExtend = False

            If A(F).Header_Type = 0 Then ' Single
              WindowTrimDist = Clearance
            ElseIf A(F).Header_Type = 1 Then ' Boxed
              WindowTrimDist = CAD.PlateElevationWidth + Clearance
            Else ' Boxed plus Single
              WindowTrimDist = CAD.PlateElevationWidth + (Clearance * 2)
            End If
            
            If A(F).FSill - P1(1) > CAD.PlateElevationWidth * 3 Then
              I = PlaceJoist(P1(0) &","& P1(1), P1(0) & "," & A(F).FSill, Flipped)
              CAD.ExtendCode = ecStart
              CAD.ExtendToInsideWeb I,StartID
              Lintel = CAD.StickHit(P1(0) & "," & A(F).FSill)
              CAD.ExtendCode = ecEnd
              CAD.ExtendToWebEx I, Lintel, -WindowTrimDist                    
            End If

            If P2(1) - A(F).TotalHead > CAD.PlateElevationWidth * 3 Then
              I = PlaceJoist(P1(0) & "," & A(F).TotalHead, P2(0) & "," & P2(1), Flipped)
              CAD.ExtendCode = ecEnd
              CAD.ExtendToInsideWeb I,EndID
              Lintel = CAD.StickHit(P1(0) & "," & A(F).TotalHead)
              CAD.ExtendCode = ecStart
              CAD.ExtendToWebEx I, Lintel, -WindowTrimDist
            End If
            CAD.AutoExtend = True
          End If
        End If
      End If
      
      If F < 0 Then
        If P2(1) - P1(1) > CAD.PlateElevationWidth * 2.5 Then
          If Flipped Then
            I = CAD.PlaceFrameObject(fotStud,StartPos,EndPos, FLIPPED, stStud)
          Else
            I = CAD.PlaceFrameObject(fotStud,StartPos,EndPos, NOT_FLIPPED, stStud)
          End If
        End If
      End If
            
'      if I <> -1 then
'        CAD.ExtendCode = ecEnd 
'        CAD.ExtendToWeb I,EndID 
'
'        CAD.ExtendCode = ecStart 
'        CAD.ExtendToWeb I,StartID 
'      End If
               
      PlaceJoist = I
    End If
  End With           
End Function

Private Sub SortRefs
  Dim V,I,O   

  tRefs = Builder.Joist_References

  For I = 0 To UBound(tRefs)
    tRefs(I) = CDbl(tRefs(I))
  Next

  If UBound(tRefs)> -1 Then
    For O = 0 To UBound(tRefs) - 1
      For I = O + 1 To UBound(tRefs)
        If tRefs(O) > tRefs(I) Then
          V = tRefs(O)
          tRefs(O) = tRefs(I)
          tRefs(I) = V
        End If
      Next
    Next
  Else
    tRefs = Array(0.0)
  End If      
End Sub
        
Private Sub SetCode
  Dim I
    
  pmCode = pmNormal
  If UBound(tRefs)> -1 Then
    If tRefs(0) < 0 Then
      pmCode = pmFwd
    Else
      For I = 0 To UBound(tRefs)
        If tRefs(I) > Builder.Length Then
          pmCode = pmBack
          Index = I       'set index for later
          Exit For
        End If
      Next
    End If
  End If
End Sub

Private Sub SetIndex
  Dim I

  If UBound(tRefs)> -1 Then
    If pmCode = pmFwd Then
      For I = 0 To UBound(tRefs)
        If tRefs(I) >= 0  Then
          Index = I - 1
          Exit For
        End If
      Next
    ElseIf pmCode = pmNormal Then
      Index = 0
    End If
  End If
End Sub

Private Sub Class_Initialize()
End Sub

End Class
