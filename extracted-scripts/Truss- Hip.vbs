'[FCAD2000-0]
'[TRUSS]
'[JOIST]

'******************************************************************************
'
'   Hip truss script
'
'   25 Feb 2003               Created
'   22 Sep 2005   N.Penny     Added Eave pick Function
'   10 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
'   03 Nov 2010   J.Burns     Modified to support Back to Back trusses
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "DivideSpace.incx"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Const TabNone = 0
Const TabBottom = 1
Const TabTop = 2
Const TabBoth = 3

Class TBuilder

  Public Roof_Pitch
  Public Roof_Eave
  Public Extension
  Public Height_At_Wall
  Public Tabs
  Public Max_Web_Spacing
  Public Webbing_Type
  Public Auto_Dimension

  Private Length
  Private MetricPitch
  Private framedimensiony2
  Private BCAxis, LCAxis, Web2Stud, Peak
  Private NumWebs, WebIndex, WebSpacing

  Public Property Get Span
    Span = Length - Eave - Extension
  End Property

  Private Function Eave
    Eave = (Roof_Eave * Sqr(2))
  End Function

  Private Function Pitch
    Pitch = (Atn(Tan(MetricPitch * Pi / 180) / Sqr(2))) * 180 / Pi
  End Function

  Public Sub Build
    Dim A, BC, LC, Z
    Dim X1, X2, L

    If ConvertPitch(Roof_Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    With CAD
      'Place bottom chord and left hand top chord
      .AutoExtend = False
      Peak = Tan(Pitch * Pi / 180) * Span + Height_At_Wall
      CL = .PlaceLine(Span & ",0", "@" & Peak + 200 & "<90")
      Web2Stud = .Web2Web / 2 + .StudElevationWidth / 2
  
      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)

      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, getXYStringFromPolar(Span,Height_At_Wall,Span,180 - Pitch), "@" & Span & "<" & -Pitch, NOT_FLIPPED, stPlate)

      'Extend top chord
      A = .PlaceLine( - Extension & ",-2000" , "@4000<90")
      .Extend LC, A

      'Extend top chord to eave
      .CopyMode = False
      C = .PlaceLine("-500,0", Span + 500 & ",0")
      D = Cos(Pitch * Pi / 180) * .StudElevationWidth
      A = .PlaceLine(Span + Eave & ",-500" , "@1000<90")
      .Extend LC, A

      'Extend chords for lip
      A = .PlaceLine( - (.StudElevationWidth + 30) & ",-1000" , "@4000<90")
      Select Case .GetListIndex(Me, "Tabs")
        Case 0 ' None
        Case 1 ' Bottom
          .Extend BC, A
        Case 2 ' Top
          If Extension = 0 Then
            .Extend LC, A
          End If
        Case 3 ' Both
          .Extend BC, A
          If Extension = 0 Then
            .Extend LC, A
          End If
      End Select

      .AutoExtend = True

      'Create chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      'Place jack studs
      If Height_At_Wall > .Web2Web Then
        .ClipRef = drRight
        A = .PlaceFrameObject(fotWeb, Span & ",0", "@" & Height_At_Wall & "<90", FLIPPED, stStud)
      End If
      .ClipRef = drLeft
      A = .PlaceFrameObject(fotWeb, "0,0", "@" & Peak & "<90", NOT_FLIPPED, stStud)
      .ExtendCode = EcEnd
      .ExtendToFurthest A, LC

      'Place Webs
      .CopyMode = True
      WebLayout = .GetListIndex (Me, "Webbing_Type")

      If WebLayout = wlFink Then
        PlaceFinkWebs
      ElseIf WebLayout = wlHowe Then
        PlaceHoweWebs
      ElseIf WebLayout = wlFan Then
        PlaceFanWebs
      Else
        PlaceFramecadWebs
      End If

      'Clean up mess
      .EraseConstructionLines
      .Translate Extension, 0
    End With
    If Auto_Dimension = True Then dimensionframe
  End Sub

  Public Sub PlaceFramecadWebs
    Dim X1, X2

    With CAD

      'Place fixed webs
      .ClipRef = drMid
      L = 78
      If Span > Height_At_Wall * 8 Then
        X1 = .PlaceLine(Span - (.StudElevationWidth + (.Web2Web / 2)) & ",0", "@" & Peak & "<90")
        L = .StudElevationWidth + (.Web2Web / 2)
        X2 = .Offset(X1, -Height_At_Wall * 2)
        L = L + Height_At_Wall * 2
        If Height_At_Wall > .StudElevationWidth * 2 Then  
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        End If
        X1 = .Offset(X2, -.Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, -Height_At_Wall * 2)
        L = L + Height_At_Wall * 2
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
      End If

      If Span > Height_At_Wall * 17 Then
        X1 = .Offset(X2, -.Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, -Height_At_Wall * 3)
        L = L + Height_At_Wall * 3
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        X1 = .Offset(X2, -.Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, -Height_At_Wall * 3)
        L = L + Height_At_Wall * 3
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
      End If

      'Place rest of webs
      WebSpacing = Span - .StudElevationWidth - L
      NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
      WebIndex = 1
      X2 = .PlaceLine(Span - L & ",0", "@" & Peak & "<90")  
      While WebIndex < NumWebs
        X1 = .Offset(X2, -.Web2Web)
        X2 = .PlaceLine( Span - L - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        Reinforce A
        WebIndex = WebIndex + 1
        If WebIndex < NumWebs + 1 Then
          X1 = .Offset(X2, -.Web2Web)
          X2 = .PlaceLine( Span - L - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          Reinforce A
        End If
        WebIndex = WebIndex + 1
      Wend
      X1 = .Offset(X2, -.Web2Web)
      X2 = .PlaceLine( (.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
      A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
      Reinforce A
    End With
  End Sub

  Public Sub PlaceFinkWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drMid

      If Span < Max_Web_Spacing * 2 Then
        X1 = .PlaceLine((.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, Span/4)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
      Else
        X1 = .PlaceLine((.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        X1 = .Offset(X2, .Web2Web)
        X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        L = Span - (Max_Web_Spacing * 2)

        While L > Max_Web_Spacing * 2
          X1 = .Offset(X2, .Web2Web)
          X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
          X1 = .Offset(X2, .Web2Web)
          X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          L = L - (Max_Web_Spacing * 2)
        Wend
      End If

    End With
  End Sub

  Public Sub PlaceHoweWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drMid

      If Span < Max_Web_Spacing * 1.5 Then
        X1 = .PlaceLine((.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, Span/4)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
      Else
        X1 = .PlaceLine((.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, Max_Web_Spacing)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        X1 = .Offset(X2, Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        L = Span - ((.StudElevationWidth * 1.5) + Max_Web_Spacing + (Web2Stud * 2))

        While L > Max_Web_Spacing + (Web2Stud * 3.5)
          X1 = .Offset(X1, Web2Stud)
          X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          X1 = .Offset(X2, Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          L = L - Max_Web_Spacing
        Wend
      End If
    End With
  End Sub

  Public Sub PlaceFanWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drMid

      If Span < Max_Web_Spacing * 2.5 Then
        X1 = .PlaceLine((.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, Span/4)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
      Else
        X1 = .PlaceLine((.StudElevationWidth / 2) + Web2Stud & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        X2 = .Offset(X2, Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        X1 = .Offset(X2, Web2Stud)
        X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        L = Span - (Max_Web_Spacing * 2.3)
        While L > Max_Web_Spacing * 2
          X2 = .Offset(X2, Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          X1 = .Offset(X2, Web2Stud)
          X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
          X2 = .Offset(X2, Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          X1 = .Offset(X2, Web2Stud)
          X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          L = L - (Max_Web_Spacing * 2)
        Wend
      End If
    End With
  End Sub

  Public Sub dimensionframe
    Dim iDimensionCount_Left, iDimensionCount_Bottom
    iDimensionCount_Left = 0
    iDimensionCount_Bottom = 0
    
    Peak = Tan(Pitch * Pi / 180) * Span + Height_At_Wall
    eavedrop = Eave * Tan(Pitch * Pi / 180)

    'this is used for calcs to get the vert dim correct on the extension. 
    XX = (Tan(MetricPitch * Pi / 180)*CAD.StudElevationWidth)
    YY = (sin(MetricPitch * Pi / 180)*XX)

    With CAD
      'Dimension Start Height
      .PlaceDimension Span + Extension + Eave & ",0" , "@" & Height_At_Wall & "<90", Span + Extension + Eave + iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"

      'Dimension Overall Height
      .PlaceDimension "0,0", "@" & Peak & "<90", -(iDimensionFirstSpace + (iDimensionCount_Left * iDimensionSpacing)) & ",0",1,-2,iDimensionFontSize,"V"
      iDimensionCount_Left = iDimensionCount_Left + 1

      'Dimension Extension Height
      If Extension > 0 Then 
        .PlaceDimension "0,0", "@" & Tan(Pitch * Pi / 180) * (Span + Extension) + Height_At_Wall - YY & "<90", -(iDimensionFirstSpace + (iDimensionCount_Left * iDimensionSpacing)) & ",0",1,-2,iDimensionFontSize,"V"
        iDimensionCount_Left = iDimensionCount_Left + 1
      End If       

      ' Dimension Extension Horizontal
      If Extension > 0 Then 
        .PlaceDimension "0,0", "@" & Extension & "<0", "0," & -(iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing)) - eavedrop ,1,-2,iDimensionFontSize,"H"
      End If 

      ' Dimension Right Eave
      If Eave > 0 Then
        .PlaceDimension Length - Eave & ",0", "@" & Eave & "<0", "0," & -(iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing)) - eavedrop,1,-2,iDimensionFontSize,"H"
      End If

      ' Dimension Bottom Chord
      If Eave > 0 OR Extension > 0 Then
        .PlaceDimension Extension & ",0", "@" & Span & "<0", "0," & -(iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing)) - eavedrop,1,-2,iDimensionFontSize,"H"
        iDimensionCount_Bottom = iDimensionCount_Bottom + 1
      End If

      ' Dimension truss overall
      .PlaceDimension "0,0", "@" & Length & "<0", "0," & -(iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing)) - eavedrop,1,-2,iDimensionFontSize,"H"
      If Eave > 0 Or Extension > 0 Then iDimensionCount_Bottom = iDimensionCount_Bottom + 1

      If InStr(Pitch, ":") >0 Then textpitch = "Roof Pitch: " & Pitch Else TextPitch = "Roof Pitch:" & Pitch & Chr(176)
      .PlaceLabel TextPitch, 0 & "," & Tan(Pitch * Pi / 180) * (Span + Extension) + Height_At_Wall - YY + iDimensionFirstSpace, iDimensionFontSize, 0
    End With
  End Sub

  Private Sub Reinforce(ID)
    If CAD.Length(ID) > 2200 Then
      CAD.Reinforce ID, 100, CAD.Length(ID) - 200, False
    End If
  End Sub

  Public Sub Pick
    Result = CAD.PickOffset("Pick eave position")
    If Not IsEmpty(Result) Then
      Roof_Eave = Result(0) / Sqr(2)
    End If
    Result = CAD.PickFrameReference("Pick start of extension")
    If Not IsEmpty(Result) Then
      Extension = Result
    Else
      Extension = 0
    End If
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    Roof_Pitch = "20"
    Roof_Eave = 400.0
    Extension = 0.0
    Height_At_Wall = 100.0
    Tabs = Array("None", "Bottom", "Top", "Both")
    Max_Web_Spacing = 750.0
    Webbing_Type = Array("FRAMECAD Default", "Fink", "Howe", "Fan")
    Auto_Dimension = True
  End Sub

End Class

'******************************************************************************
'  Create an instance of CAD interface and TBuilder
'******************************************************************************

Dim CAD
Set CAD = CADInterface
Dim Builder
Set Builder = New TBuilder

'******************************************************************************
'  Main Function to return instance of TBuilder to caller
'******************************************************************************

Function Main
  Set Main = Builder
End Function

'******************************************************************************
'  Build function
'******************************************************************************

Sub Build
  Dim PrevLocale
  PrevLocale = SetLocale(5129)
  Builder.Build
  SetLocale(PrevLocale)
End Sub

'******************************************************************************
'  Include
'
'  Includes external source files
'
'******************************************************************************

Sub Include(File)
  Dim fso, f, Str
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.OpenTextFile(File, 1)
  Str = f.ReadAll
  f.Close
  ExecuteGlobal Str
End Sub
