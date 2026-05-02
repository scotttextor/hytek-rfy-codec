'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Generic Roof panel for hip and/or valley
'
'  11 Dec 2003                Created
'  21 Sep 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "Build.incx"
Include "Panel Grid Class.incx"

'******************************************************************************
'  Panel side types
'******************************************************************************

Const stStraight = 0
Const stHip = 1
Const stValley = 2
Const stHipValley = 3

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder
  Public Width
  Public Span
  Public Left_Span
  Public Right_Span
  Public Pitch
  Public Stud_Spacing
  Public Nog_Spacing
  Public Eave
  Public LeftType
  Public RightType
  Public Is_Panel_Offset
  Public Offset
  Public Adjust_Ridge
  Public Grid_References
  Public Auto_Dimension

  Private HeightAdjust
  Private MetricPitch

  Private Function ToRads(Value)
    ToRads = Value * Pi / 180
  End Function

  Private Function ToDegs(Value)
    ToDegs = Value * 180 / Pi
  End Function

  Private Function Alpha
    Alpha = ToRads(MetricPitch)
  End Function

  Private Function Height
    If Is_Panel_Offset Then
      Height = (Tan(Alpha) * Offset) + (CAD.PlateWeb / Cos(Alpha))
    Else
      Height = - HeightAdjust
    End If
  End Function

  Private Function RidgeOffset
    If Adjust_Ridge Then
      RidgeOffset = Tan(Alpha) * CAD.PlateWeb
    Else
      RidgeOffset = 0
    End If
  End Function

  Public Sub Build
    Dim ActualLength
    Dim HipOffset, Theta
    Dim Position, tA, LeftSide, RightSide, Bottom, Top, Stud
    Dim Left, Right
    Dim LeftType, RightType
    Dim VAxis, HAxis, Intersection
    Dim LeftHip, RightHip

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    With CAD

      'Initialise entities
      LeftSide = -1
      RightSide = -1
      Bottom = -1
      Top = -1
      LeftHip = -1
      RightHip = -1

      'Set calculated variables
      Theta = Atn(1 / Cos(Alpha))
      HipOffset = Cos(Theta) * Sin(Alpha) * .StudWeb
      HeightAdjust = (Tan(Alpha) * Eave) - (.PlateWeb / Cos(Alpha))
      ActualLength = Span / Cos(Alpha) - RidgeOffset
      LeftType = .GetListIndex (Me, "LeftType")
      RightType = .GetListIndex (Me, "RightType")

      'Create axis for setting out horizontal elements
      If LeftType = RightType Then
        tA = 90
      ElseIf LeftType = stHip Then
        If RightType = stStraight Then
          tA = ToDegs((Theta + ((Pi / 2 - Theta) / 2)))
        Else
          tA = ToDegs(Theta)
        End If
      ElseIf RightType = stHip Then
        If LeftType = stStraight Then
          tA = ToDegs(Pi - (Theta + ((Pi / 2 - Theta) / 2)))
        Else
          tA = ToDegs(Pi - Theta)
        End If
      Else
        tA = 90
      End If

      VAxis = .PlaceLine(Width / 2 & ",0" , "@" & 2.5 * ActualLength & "<" & tA)

      'Build frame ...
      .AutoExtend = True
      .CopyMode = False
      .ExtendToRay = True

      'Create frame
      .ClipRef = drRight
      Bottom = .PlaceFrameObject(fotBottomPlate, "0,0" , Width & ",0", FLIPPED, stPlate)
      .ClipRef = drLeft
      HAxis = .PlaceLine( - Width * 10 & "," & ActualLength, "@" & 20 * Width & "<0")

      Top = .PlaceFrameObject(fotTopPlate, .Intersection(VAxis, HAxis) , "@100<0", NOT_FLIPPED, stPlate)

      Grid.InitArrays
      Grid.StartClippers(0) = Bottom
      Grid.EndClippers(0) = Top

      .ClipRef = drRight

      Select Case RightType
        Case stStraight
          Right = Width
          RightSide = .PlaceFrameObject(fotStud, Width & ",0" , Width & "," & ActualLength, FLIPPED, stStud)
          .ExtendToWeb Top, RightSide
        Case stHip
          Right = Width
          RightSide = .PlaceFrameObject(fotTopChord, Width & ",0" , "@" & ActualLength & "<" & ToDegs(Pi - Theta), FLIPPED, stStud)
          .Offset RightSide, - HipOffset
          .AutoExtend = False
          .ExtendToWeb RightSide, Top
          .ExtendToWeb RightSide, Bottom
          .ExtendToWeb Top, RightSide
          .ExtendToWeb Bottom, RightSide
          Grid.AddClipper RightSide, ecEnd
        Case stValley
          Right = Width + Span
          RightSide = .PlaceFrameObject(fotBottomChord, Width & ",0" , "@" & ActualLength & "<" & ToDegs(Theta), FLIPPED, stStud)
          .AutoExtend = False
          .ExtendToWeb RightSide, Top
          .ExtendToWeb RightSide, Bottom
          .ExtendToWeb Top, RightSide
          .ExtendToWeb Bottom, RightSide
          Grid.AddClipper RightSide, ecStart
        Case stHipValley
          Right = Width + Right_Span
          RightHip = .PlaceFrameObject(fotTopChord, Width + 2 * Right_Span & ",0" , "@" & 3 * ActualLength & "<" & ToDegs(Pi - Theta), FLIPPED, stStud)
          .Offset RightHip, - HipOffset
          RightSide = .PlaceFrameObject(fotBottomChord, Width & ",0" , "@" & ActualLength & "<" & ToDegs(Theta), FLIPPED, stStud)
          .AutoExtend = False
          .ExtendCode = ecEnd
          .ExtendToWeb RightSide, RightHip
          .ExtendCode = ecEnd
          .ExtendToWeb Top, RightHip
          .ExtendCode = ecEnd
          .ExtendToWeb RightHip, Top
          .ExtendCode = ecStart
          .ExtendToWeb RightHip, RightSide
          .ExtendToWeb Bottom, RightSide
          Grid.AddClipper RightSide, ecStart
          Grid.AddClipper RightHip, ecEnd
      End Select

      .ClipRef = drLeft

      Select Case LeftType
        Case stStraight
          Left = 0
          LeftSide = .PlaceFrameObject(fotStud, "0,0" , "0," & ActualLength, NOT_FLIPPED, stStud)
          .ExtendToWeb Top, LeftSide
        Case stHip
          Left = 0
          LeftSide = .PlaceFrameObject(fotTopChord, "0,0" , "@" & ActualLength & "<" & ToDegs(Theta), NOT_FLIPPED, stStud)
          .Offset LeftSide, HipOffset
          .AutoExtend = False
          .ExtendToWeb LeftSide, Top
          .ExtendToWeb LeftSide, Bottom
          .ExtendToWeb Top, LeftSide
          .ExtendToWeb Bottom, LeftSide
          Grid.AddClipper LeftSide, ecEnd               
        Case stValley
          Left = - Span
          LeftSide = .PlaceFrameObject(fotBottomChord, "0,0" , "@" & ActualLength & "<" & ToDegs(Pi - Theta), NOT_FLIPPED, stStud)
          .AutoExtend = False
          .ExtendToWeb LeftSide, Top
          .ExtendToWeb LeftSide, Bottom
          .ExtendToWeb Top, LeftSide
          .ExtendToWeb Bottom, LeftSide
          Grid.AddClipper LeftSide, ecStart
        Case stHipValley
          Left = - Left_Span
          LeftHip = .PlaceFrameObject(fotTopChord, -2 * Left_Span & ",0" , "@" & 3 * ActualLength & "<" & ToDegs(Theta), NOT_FLIPPED, stStud)
          .Offset LeftHip, HipOffset
          LeftSide = .PlaceFrameObject(fotBottomChord, "0,0" , "@" & ActualLength & "<" & ToDegs(Pi - Theta), NOT_FLIPPED, stStud)
          .AutoExtend = False
          .ExtendCode = ecEnd
          .ExtendToWeb LeftSide, LeftHip
          .ExtendCode = ecStart
          .ExtendToWeb Top, LeftHip
          .ExtendCode = ecEnd
          .ExtendToWeb LeftHip, Top
          .ExtendCode = ecStart
          .ExtendToWeb LeftHip, LeftSide
          .ExtendToWeb Bottom, LeftSide
          Grid.AddClipper LeftSide, ecStart
          Grid.AddClipper LeftHip, ecEnd
      End Select

      'Place jack studs
      .AutoExtend = True
      .ClipRef = drMid
      .ExtendToRay = False

      'Verticals
      Grid.PlaceVerticals Left, Right

      'Horizontals
      Grid.InitArrays
      Grid.StartClippers(0) = LeftSide
      Grid.EndClippers(0) = RightSide
      Grid.AddClipper LeftHip, ecStart
      Grid.AddClipper RightHip, ecEnd

      'Set offset for grid layout if an offset panel
      If Is_Panel_Offset Then
        Grid.PlaceHorizontals Left, (Eave + Offset) / Cos(Alpha), ActualLength
      Else
        Grid.PlaceHorizontals Left, 0, ActualLength
      End If

      'Clean up mess
      .EraseConstructionLines
      .FrameElevation = Height
      .FramePitch = -90 + MetricPitch
      .ExtendToRay = True
    End With

    If Auto_Dimension = True Then DimensionFrame
  End Sub

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    Dim sPitchText

    'Place Bottom Dimension (Width)
    CAD.PlaceDimension "0,0",Width & ",0", Width/2 & "," & -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"

    'Place Dimension for span of frame
    Select Case LeftType(CAD.GetListIndex (Me, "LeftType"))
      Case "Straight","Hip"
        CAD.PlaceDimension "0,0","0," & Span, -iDimensionFirstSpace & "," & Span/2,1,-2,iDimensionFontSize,"V"
      Case Else
        CAD.PlaceDimension "0,0","0," & Span, - span - iDimensionFirstSpace & "," & Span/2,1,-2,iDimensionFontSize,"V"
    End Select

    If InStr(Pitch, ":") > 0 Then sPitchText = "Roof Pitch: " & Pitch Else sPitchText = "Roof Pitch: " & Pitch & Chr(176)
      CAD.PlaceLabel sPitchText , 0 & "," & Span + iDimensionFirstSpace , iDimensionFontSize, 0
    End Sub

    Public Function ReadOnlyAttributes
      ReadOnlyAttributes = Array("Width")
    End Function

  Public Sub Pick
    Dim Result

    Result = CAD.PickDistanceToPointEx("Pick point on ridge")
    If Not IsEmpty(Result) Then
      Span = Result(1)
    End If

    If CAD.GetListIndex (Me, "LeftType") = stHipValley Then
      Result = CAD.PickDistanceToPointEx("Pick left ridge intersection")
      If Not IsEmpty(Result) Then
        Left_Span = Result(1)
      End If
    End If

    If CAD.GetListIndex (Me, "RightType") = stHipValley Then
      Result = CAD.PickDistanceToPointEx("Pick right ridge intersection")
      If Not IsEmpty(Result) Then
        Right_Span = Result(1)
      End If
    End If

    If Not Is_Panel_Offset Then
      Result = CAD.PickDistanceToPointEx("Pick point on eave")
      If Not IsEmpty(Result) Then
        Eave = Result(3)
      End If
    Else
      Result = CAD.PickDistanceToPoint("Pick a point on the outside of the wall")
      If Not IsEmpty(Result) Then
        Offset = Result
      Else
        Offset = 0
      End If
    End If
  End Sub

  Public Function PickArray
    Dim Result

    Result = CAD.PickFrameReference("Pick a gridding reference")
    If Not IsEmpty(Result) Then
      PickArray = Result
    Else
      PickArray = 0
    End If
  End Function

  Private Sub Class_Initialize()
    Width = CAD.FrameLength("")
    Span = 2000.0
    Left_Span = 0.0
    Right_Span = 0.0
    Stud_Spacing = 600.0
    Nog_Spacing = 600.0
    Pitch = "20"
    Eave = 400
    LeftType = Array("Straight", "Hip", "Valley", "Complex Valley")
    RightType = Array("Straight", "Hip", "Valley", "Complex Valley")
    Adjust_Ridge = True
    Is_Panel_Offset = False
    Offset = 0
    Grid_References = Array(0.0)
    Auto_Dimension = True
  End Sub

End Class

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
