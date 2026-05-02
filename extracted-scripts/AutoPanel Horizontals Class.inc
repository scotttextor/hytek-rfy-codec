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
'   Global instance of class
'******************************************************************************

Dim Horizontals
Set Horizontals = New THorizontals

'******************************************************************************
'
'   TStud
'
'   Implements placement of studs using frame reference array
'   Accesses global Builder & CAD instances
'
'******************************************************************************

Class THorizontals

Private tRefs
Private pmCode
Private Index
Private ETop
Private ELeft
Private EBottom
Private ERight

Public Sub Place
  Dim F, SP, EP, endPoint
  Dim Pos, EnvelopeIntersections, I, J

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

    ' Place reference studs first to ensure they do not get skipped later if overlapping another stud
    ' (reference studs are more important)

    for I = 0 to UBound(tRefs)
      EnvelopeIntersections = TM.EnvelopeAlongY(tRefs(I), True)
      for J = 0 to ((UBound(EnvelopeIntersections) -1) / 2)
        SP = EnvelopeIntersections(J * 2 + 1, 0)
        EP = EnvelopeIntersections(J * 2, 0)
        PlacePlate EP, SP, False
      next
    next  

    If pmCode = pmBack Then
      Do
        Pos = tRefs(Index)

        Pos = Pos - .Horizontal_Spacing

        Index =Index - 1
        If Index < 0 Then
          endPoint = EBottom  
        Else
          endPoint = tRefs(Index)
        End If
        If endPoint < EBottom Then
          endPoint = EBottom
        End If

        Do
          if Pos <= endPoint then exit do

            EnvelopeIntersections = TM.EnvelopeAlongY(Pos, True)
            for I = 0 to ((UBound(EnvelopeIntersections)-1)/ 2)
              SP = EnvelopeIntersections(I*2+1,0)
              EP = EnvelopeIntersections(I*2,0)
              PlacePlate EP,SP,False
            next

            Pos = Pos - .Horizontal_Spacing
          Loop Until Pos <= endPoint

        Loop Until endPoint = EBottom
      Else

        '  pmNormal - place studs from first Ref back to start and then forwards, restarting at each
        '  new Ref value. stop when passed end of stick

        If pmCode = pmNormal Then
          Pos = tRefs(Index)
          Pos = Pos - .Horizontal_Spacing
          Do
            if Pos <= EBottom then exit do
              EnvelopeIntersections = TM.EnvelopeAlongY(Pos, True)
              for I = 0 to ((UBound(EnvelopeIntersections) -1) / 2)
                SP = EnvelopeIntersections(I * 2 + 1, 0)
                EP = EnvelopeIntersections(I * 2, 0)

                PlacePlate EP,SP,False
              next

              Pos = Pos - .Horizontal_Spacing
            Loop Until Pos <= EBottom
          End If

          '  pmFwd - place studs forward from first Ref, restarting at each new Ref value
          '  stop when passed end of stick (also if pmNormal)
          Do
            Pos = tRefs(Index)
            Pos = Pos + .Horizontal_Spacing
            If pmCode = pmNormal Then
              pmCode = pmFwd
            End If

            Index = Index + 1
            If Index > UBound(tRefs) Then
              endPoint = ETop
            Else
              endPoint = tRefs(Index)
            End If

            Do While Pos < endPoint
              EnvelopeIntersections = TM.EnvelopeAlongY(Pos, True)
              for I = 0 to ((UBound(EnvelopeIntersections) -1) / 2)
                SP = EnvelopeIntersections(I * 2 + 1, 0)
                EP = EnvelopeIntersections(I * 2, 0)
                PlacePlate EP,SP,False
              next

              Pos = Pos + .Horizontal_Spacing
            Loop

          Loop Until endPoint >= ETop
        End If
      End With
    End Sub

    '  Place stud at Pos if not over end studs or a feature
    '  flipped if flag set

    Private Function PlacePlate(StartPos,EndPos,Flipped)
      Dim F, I, StartID, EndID
      With Builder
        I = -1
        If CAD.IsStick(StartPos) and CAD.IsStick(EndPos) then
          StartID = CAD.StickHit(StartPos)
          EndID = CAD.StickHit(EndPos)

          if CAD.OverlapsStick(StartPos, EndPos, CAD.PlateElevationWidth) = -1 then
            If Flipped Then
              I = CAD.PlaceFrameObject(fotNog,StartPos,EndPos, FLIPPED, stPlate)
            Else
              I = CAD.PlaceFrameObject(fotNog,StartPos,EndPos, NOT_FLIPPED, stPlate)
            End If

            if I <> -1 then
              CAD.ExtendCode = ecEnd
              CAD.ExtendToFurthest I, EndID

              CAD.ExtendCode = ecStart
              CAD.ExtendToFurthest I, StartID
            End If

            PlacePlate = I
          end if
        End If
      End With
    End Function

    Function Dgr2Rad(Degrees)
        Dgr2Rad = Degrees * (2 * PI) / 360
    End Function
   
    Private Sub SortRefs
    Dim V,I,O,P
	
        P = Dgr2Rad(CDbl(90) + CDbl(CAD.FramePitch))
		
        tRefs = Builder.Horizontal_References
		
        For I = 0 To UBound(tRefs)
			tRefs(I) = CDbl(tRefs(I)) / cos(P)
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
                    If tRefs(I) > ETop Then
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
