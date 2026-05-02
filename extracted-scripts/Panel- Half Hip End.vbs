'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Roof panel script for half hip end
'
'  15 Dec 2003                Created
'  20 Sep 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "Build.incx"
Include "Panel Grid Class.incx"

Const ttLeft = 0
Const ttRight = 1

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder
  Public Width
  Public Pitch
  Public Stud_Spacing
  Public Nog_Spacing
  Public Eave
  Public Half
  Public Is_Panel_Offset
  Public Offset
  Public Grid_References
  Public Auto_Dimension

  Private HalfType
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

  Public Sub Build
    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    Dim ActualLength, RidgeOffset
    Dim HipOffset, Theta, Left, Right
    Dim Position, tA, LeftSide, RightSide, Bottom, Stud
    Dim SidePosition, TruncateSide, StudEnd

    With CAD

      'Initialise entities
      LeftSide = -1
      RightSide = -1
      Bottom = -1
      TruncateSide = -1

      HalfType = .GetListIndex (Me, "Half")
      Theta = Atn(1 / Cos(Alpha))
      HipOffset = Cos(Theta) * Sin(Alpha) * .StudWeb
      HeightAdjust = (Tan(Alpha) * Eave) - (.PlateWeb / Cos(Alpha))
      RidgeOffset = Tan(Alpha) * .PlateWeb
      ActualLength = (Width) / Cos(Alpha) - RidgeOffset

      .AutoExtend = True
      .CopyMode = False
      .ExtendToRay = True

      'Create frame
      .ClipRef = drRight
      .AutoExtend = False

      Bottom = .PlaceFrameObject(fotBottomPlate, "0,0" , 2 * Width & ",0", FLIPPED, stPlate)
      If HalfType = ttLeft Then
        Left = 0
        Right = Width
        .ClipRef = drLeft
        LeftSide = .PlaceFrameObject(fotTopChord, "0,0" , "@" & ActualLength & "<" & ToDegs(Theta), NOT_FLIPPED, stStud)
        .Offset LeftSide, HipOffset
        .ClipRef = drRight
        SidePosition = Width
        TruncateSide = .PlaceFrameObject(fotStud, SidePosition & ",0", "@" & ActualLength & "<90" , FLIPPED, stStud)
        .ExtendCode = ecEnd
        .ExtendToWeb Bottom, TruncateSide
        .ExtendCode = ecStart
        .ExtendToWeb Bottom, LeftSide
        .ExtendCode = ecEnd
        .ExtendToWeb LeftSide, TruncateSide
        .ExtendCode = ecStart
        .ExtendToWeb LeftSide, Bottom
        .ExtendCode = ecEnd
        .ExtendToWeb TruncateSide, LeftSide
      Else
        Left = 0
        Right = Width
        .ClipRef = drRight
        RightSide = .PlaceFrameObject(fotTopChord, 2 * Width & ",0" , "@" & ActualLength & "<" & ToDegs(Pi - Theta), FLIPPED, stStud)
        .Offset RightSide, - HipOffset
        .ClipRef = drLeft
        SidePosition = Width
        TruncateSide = .PlaceFrameObject(fotStud, SidePosition & ",0", "@" & ActualLength & "<90" , NOT_FLIPPED, stStud)
        .ExtendCode = ecStart
        .ExtendToWeb Bottom, TruncateSide
        .ExtendCode = ecEnd
        .ExtendToWeb Bottom, RightSide
        .ExtendCode = ecEnd
        .ExtendToWeb RightSide, TruncateSide
        .ExtendCode = ecStart
        .ExtendToWeb RightSide, Bottom
        .ExtendCode = ecEnd
        .ExtendToWeb TruncateSide, RightSide
        .Translate - SidePosition, 0
      End If

      'Place jack studs
      .AutoExtend = True
      .ClipRef = drMid
      .ExtendToRay = False

      'Verticals
      Grid.InitArrays
      Grid.StartClippers(0) = Bottom
      Grid.EndClippers(0) = LeftSide
      Grid.AddClipper RightSide, ecEnd
      Grid.PlaceVerticals Left, Right

      'Horizontals
      Grid.InitArrays
      Grid.StartClippers(0) = LeftSide
      Grid.EndClippers(0) = RightSide
      Select Case HalfType
        Case ttLeft
          Grid.AddClipper TruncateSide, ecEnd
        Case ttRight
          Grid.AddClipper TruncateSide, ecStart
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

  Public Sub DimensionFrame
    'This subroutine will dimension the frame external measurements
    Dim iFrameHeight, sTextPitch
    iFrameHeight = (Width) / Cos(Alpha) - (Tan(Alpha) * CAD.PlateWeb)
    
    If InStr(Pitch, ":") > 0 Then
      sTextPitch = "Roof Pitch: " & Pitch
    Else
      sTextPitch = "Roof Pitch: " & Pitch & Chr(176)
    End If
    
    With CAD
      'Place bottom Dimension
      CAD.PlaceDimension "0,0",Width & ",0", "0," & -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"
      
      'Place side dimension and text for the pitch
      If .GetListIndex (Me, "Half") = ttLeft Then
        .PlaceDimension "0,0",Width & "," & iFrameHeight, Width + iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"
        .PlaceLabel sTextPitch, 0 & "," & iFrameHeight, iDimensionFontSize, 0
      Else
        .PlaceDimension "0,0","0," & iFrameHeight, -iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"
        .PlaceLabel sTextPitch, Width - .TextWidth(sTextPitch, iDimensionFontSize) & "," & iFrameHeight, iDimensionFontSize, 0
        msgbox(.TextWidth(sTextPitch, iDimensionFontSize) )
      End If
    End With    
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Width")
  End Function

  Public Sub Pick
    Dim Result

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
    Eave = 400.0
    Half = Array("Left", "Right")
    Is_Panel_Offset = False
    Offset = 0.0
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
