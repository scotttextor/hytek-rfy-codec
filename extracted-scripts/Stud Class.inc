'******************************************************************************
'
'  Stud Class.inc
'
'  Include file for Load bearing stud placement in wall
'  Utilises frame reference array passed as parameter
'
'  01 Mar 2001                Created
'  22 Feb 2006    N.Penny     Now supports SiteInfo.inc (StudEndClearance)
'  27 Aug 2010    K.Michel    Allows for bolt holes next to studs
'  16 Aug 2011     J.Burns     Added Stud Dimensioning
'
'******************************************************************************


Const   pmNormal        =   0
Const   pmBack          =   1
Const   pmFwd           =   2

Dim FirstStud, EndStud

Dim Studs
Set Studs = New TStud

Class TStud

  Public  Centers()
  Private tRefs
  Private pmCode
  Private Index
  Private NumStuds
  Private LastCenter

  Public Sub Place
    Dim Pos
  
    With Builder
      CAD.ClipRef = drLEFT
      FirstStud = PlaceStud(0,False)
    End With

    'Place remainder using stud centers
    CAD.ClipRef = drMID
    
    For Each Pos In Centers
      If Pos > 0 Then
        PlaceStud Pos,False
      End If
    Next

    With Builder
      CAD.ClipRef = drRIGHT
      EndStud = PlaceStud(.Length,True)
    End With
  End Sub

  Public Sub SetPositions
    Dim Pos, endPoint

  ReDim Centers(0)
  LastCenter = 0

    'Sort Frame references by value into local copy
    SortRefs
  
    'Set placement method code - if any Ref > Length then work backwards
    'if any < 0 then work forwards else work back from first Ref and then
    'forwards. 

    SetCode

    'Set start reference index - Index of first Ref value to use

    SetIndex

    With Builder

      'Calculate positions using placement method and add to Centers array
      'pmBack - place studs from end back to start of stick, restart at each new Ref
      'stop when passed start of stick

      CAD.ClipRef = drMID
      If pmCode = pmBack Then
        Do
          Pos = tRefs(Index)
          Index =Index - 1
          If Index < 0 Then
            endPoint = 0
          Else
            endPoint = tRefs(Index)
          End If
          If endPoint < 0 Then
            endPoint = 0
          End If

          'Place studs
          Do
            If (Pos < .Length - (1.5 * CAD.StudElevationWidth)) And (Pos > 1.5 * CAD.StudElevationWidth) Then
              AddCenter(Pos)
            End If
            Pos = Pos - .Stud_Spacing
          Loop Until Pos <= endPoint

        Loop Until endPoint = 0
      Else
      'pmNormal - place studs from first Ref back to start and then forwards, restarting at each
      'new Ref value. stop when passed end of stick

        If pmCode = pmNormal Then
          Pos = tRefs(Index)
          Do
            If (Pos < .Length - (1.5 * CAD.StudElevationWidth)) And (Pos > 1.5 * CAD.StudElevationWidth) Then
              AddCenter(Pos)
            End If 
            Pos = Pos - .Stud_Spacing
          Loop Until Pos <= 0
        End If

        'pmFwd - place studs forward from first Ref, restarting at each new Ref value
        'stop when passed end of stick (also if pmNormal)
        Do
          Pos = tRefs(Index)
          If pmCode = pmNormal Then
            Pos = Pos + .Stud_Spacing
            pmCode = pmFwd
          End If
          Index = Index + 1
          If Index > UBound(tRefs) Then
            endPoint = .Length
          Else
            endPoint = tRefs(Index)
          End If
          If endPoint > .Length Then
            endPoint = .Length
          End If

          'Place studs
          Do
            If (Pos < .Length - (1.5 * CAD.StudElevationWidth)) And (Pos > 1.5 * CAD.StudElevationWidth) Then
              If Pos - LastCenter > CAD.StudElevationWidth + 2 Then
                AddCenter(Pos)
              End If
            End If
            Pos = Pos + .Stud_Spacing
          Loop Until Pos >= endPoint
        Loop Until endPoint = .Length
      End If
    End With   
    SortCenters
  End Sub

  'Add passed value to Centers array
  Private Sub AddCenter(Value)
    ReDim Preserve Centers(NumStuds)
    Centers(NumStuds) = Value
    LastCenter = Value
    NumStuds = NumStuds + 1
  End Sub

  '  Place stud at Pos if not over end studs or a feature
  '  flipped if flag set
  Private Function PlaceStud(Pos,Flipped)
    Dim F,I, Axis
    With Builder

      I = -1
      F = CAD.StickOverFeature (Pos & ",0" , "@" & .Height & "<90")
      If  F < 0 Then
        If Flipped Then
          I = CAD.PlaceFrameObject(fotStud, Pos & ",0" , "@" & .Height & "<90", FLIPPED, stStud)
          
          If .BPlate_Bolt_Holes = True Then
            CAD.PlaceExplicitTool "SingleBoltHole", Pos - 100 & ",-10", "@" & (CAD.StudElevationWidth / 2) + 10 & "<90"
          End If 
          If .SHole_Vertical = True Then
            CAD.PlaceServiceHoles Pos - 100 & ",50", "@" & .getFrameHeight(Pos - 100) & "<90"
          End If 
        Else
          I = CAD.PlaceFrameObject(fotStud, Pos & ",0" , "@" & .Height & "<90", NOT_FLIPPED, stStud)
          
          If .BPlate_Bolt_Holes = True Then
            CAD.PlaceExplicitTool "SingleBoltHole", Pos + 100 & ",-10", "@" & (CAD.StudElevationWidth / 2) + 10 & "<90"
          End If 
          If .SHole_Vertical = True Then
            CAD.PlaceServiceHoles Pos + 100 & ",50", "@" & .getFrameHeight(Pos + 100) & "<90"
          End If     
        End If

        Builder.AddPlacedStudCenter(Pos)

        If Builder.MetricPitch <> 0 Then
          Axis =CAD.PlaceStickAxis(TopPlate,StudEndClearance)
          CAD.Extend I,Axis
        End If
      End If
      PlaceStud = I

   
    End With      
    CAD.EraseConstructionLines     
  End Function

  
  
  Private Sub SortRefs
    Dim V,I,O   

    tRefs = Builder.Framing_References
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

  'Sort Centers by distance from 0
  Private Sub SortCenters
    Dim V,I,O

    If UBound(Centers)> -1 Then
      For O = 0 To UBound(Centers) - 1
        For I = O + 1 To UBound(Centers)
          If Centers(O) > Centers(I) Then
            V = Centers(O)
            Centers(O) = Centers(I)
            Centers(I) = V
          End If
        Next
      Next
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
    Index = 0
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
    EndStud = -1
    FirstStud = -1
    ReDim Centers(0)
    NumStuds = 0
  End Sub

End Class
