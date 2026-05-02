'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Roof panel script for hip end
'
'  15 Dec 2003                Created
'  20 Sep 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "Build.incx"
Include "Panel Grid Class.incx"

'******************************************************************************
'  Truncate types
'******************************************************************************

Const ttNone = 0
Const ttLeft = 1
Const ttRight = 2

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

  Public Width
  Public Pitch
  Public Stud_Spacing
  Public Nog_Spacing
  Public Eave
  Public Truncate
  Public Peak
  Public Is_Panel_Offset
  Public Offset
  Public Offset_Base
  Public Grid_References
  Public Auto_Dimension

  Private TruncateType
  Private HeightAdjust
  Private MetricPitch
  Private textpitch
  Private textpitchy

  Private Function FWidth
    If TruncateType = ttNone Then
      FWidth = Width
    Else
      FWidth = 2 * Peak
    End If
  End Function

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

  Public Sub Build
    Dim ActualLength, RidgeOffset
    Dim HipOffset, Theta, Left, Right
    Dim Position, tA, LeftSide, RightSide, Bottom, Stud
    Dim TruncatePosition, TruncateSide, StudEnd

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    With CAD

      'Initialise entities
      LeftSide = -1
      RightSide = -1
      Bottom = -1
      TruncateSide = -1

      TruncateType = .GetListIndex (Me, "Truncate")
      Theta = Atn(1 / Cos(Alpha))
      HipOffset = Cos(Theta) * Sin(Alpha) * .StudWeb
      HeightAdjust = (Tan(Alpha) * Eave) - (.PlateWeb / Cos(Alpha))
      RidgeOffset = Tan(Alpha) * .PlateWeb
      ActualLength = (FWidth / 2) / Cos(Alpha) - RidgeOffset
      .AutoExtend = True
      .CopyMode = False
      .ExtendToRay = True

      'Create frame
      .ClipRef = drRight
      Bottom = .PlaceFrameObject(fotBottomPlate, "0,0" , FWidth & ",0", FLIPPED, stPlate)
      If Offset_Base Then
        .Offset Bottom, RidgeOffset
      End If
      .ClipRef = drLeft
      LeftSide = .PlaceFrameObject(fotTopChord, "0,0" , "@" & ActualLength & "<" & ToDegs(Theta), NOT_FLIPPED, stStud)
      .Offset LeftSide, HipOffset
      .ClipRef = drRight
      RightSide = .PlaceFrameObject(fotTopChord, FWidth & ",0" , "@" & ActualLength & "<" & ToDegs(Pi - Theta), FLIPPED, stStud)
      .Offset RightSide, - HipOffset

      Grid.InitArrays
      Grid.StartClippers(0) = Bottom
      Grid.EndClippers(0) = LeftSide
      Grid.AddClipper RightSide, ecEnd

      'Extend parts
      .AutoExtend = False
      .ExtendCode = ecEnd
      .ExtendToWeb LeftSide, RightSide
      .ExtendCode = ecEnd
      .ExtendToWeb RightSide, LeftSide
      .ExtendCode = ecStart
      .ExtendToWeb LeftSide, Bottom
      .ExtendCode = ecStart
      .ExtendToWeb RightSide, Bottom
      .ExtendCode = ecStart
      .ExtendToWeb Bottom, LeftSide
      .ExtendCode = ecEnd
      .ExtendToWeb Bottom, RightSide

      'Truncate if necessary
      Select Case TruncateType
        Case ttNone
          TruncatePosition = 0
          Left = 0
          Right = FWidth
        Case ttLeft
          .ClipRef = drLeft
          TruncatePosition = FWidth - Width
          Left = 0
          Right = Width
          TruncateSide = .PlaceFrameObject(fotStud, TruncatePosition & ",0", "@" & ActualLength & "<90" , NOT_FLIPPED, stStud)
          .ExtendCode = ecStart
          .ExtendToWeb Bottom, TruncateSide
          .ExtendCode = ecStart
          .ExtendToWeb LeftSide, TruncateSide
          .ExtendCode = ecEnd
          .ExtendToWeb TruncateSide, LeftSide
          .Translate - TruncatePosition, 0
        Case ttRight
          .ClipRef = drRight
          TruncatePosition = Width
          Left = 0
          Right = TruncatePosition
          TruncateSide = .PlaceFrameObject(fotStud, TruncatePosition & ",0", "@" & ActualLength & "<90" , FLIPPED, stStud)
          .ExtendCode = ecEnd
          .ExtendToWeb Bottom, TruncateSide
          .ExtendCode = ecStart
          .ExtendToWeb RightSide, TruncateSide
          .ExtendCode = ecEnd
          .ExtendToWeb TruncateSide, RightSide
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
      Select Case TruncateType
        Case ttLeft
          Grid.AddClipper TruncateSide, ecStart
        Case ttRight
          Grid.AddClipper TruncateSide, ecEnd
      End Select

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
    Dim iFrameHeight, sTextPitch
    iFrameHeight = (Width / 2) / Cos(Alpha) - (Tan(Alpha) * CAD.PlateWeb)

    If InStr(Pitch, ":") > 0 Then
      sTextPitch = "Roof Pitch: " & Pitch
    Else
      sTextPitch = "Roof Pitch: " & Pitch & Chr(176)
    End If

    With CAD
      'Place bottom Dimension
      .PlaceDimension "0,0",Width & ",0", "0," & -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"

      'Place side Dimension
      .PlaceDimension "0,0","0," & iFrameHeight, -iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"

      'Place pitch
      .PlaceLabel sTextPitch, "0," & iFrameHeight , iDimensionFontSize, 0
    End With
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Width")
  End Function

  Public Sub Pick
    Dim Result

    If CAD.GetListIndex (Me, "Truncate") <> ttNone Then
      Result = CAD.PickDistanceToPointEx("Pick peak")
      If Not IsEmpty(Result) Then
        Peak = Result(1)
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
    Stud_Spacing = 600.0
    Nog_Spacing = 600.0
    Pitch = "20"
    Eave = 400
    Truncate = Array("None", "Left", "Right")
    Peak = 0.0
    Is_Panel_Offset = False
    Offset = 0
    Offset_Base = False
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
