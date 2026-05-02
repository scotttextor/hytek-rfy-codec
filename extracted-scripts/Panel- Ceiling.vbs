'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Panel- Ceiling.vbs
'
'   Produces Ceilng Panel
'   Uses frame reference array to govern stud placement
'   and Triple Stud Connections for supporting walls
'
'  01 Mar 2001                Created
'  21 Sep 2004    J.Burns     Added dimensioning
'  17 Jul 2005    N.Penny     Modified to Panel- Ceiling Advance
'  25 Aug 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'  16 Aug 2011     J.Burns     Added Stud Dimensioning
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"
Include "Features.incx"
Include "PlaceNogs.incx"
Include "PlaceServices.incx"
Include "Stud Class.incx"
Include "Opening.incx"
Include "Ceiling Triples.incx"
Include "ConvertPitch.incx"
Include "libGeneral.incx"
Include "DivideSpace.incx"

Dim TopPlate, OK

Function GetFeatures
  GetFeatures = Array("Openings", "Triples")
End Function

Function MakeFeature(ClassName, Name)
  Select Case ClassName
    Case "Openings" Features.Add Name, New TOpening
      Set MakeFeature = Features.Item(Name)
    Case "Triples" Features.Add Name, New TTriple
      Set MakeFeature = Features.Item(Name)
    Case Else MsgBox "Unknown class - " & ClassName
  End Select
End Function

Class TBuilder

  Public Length
  Public PanelWidth
  Public CeilingPitch
  Public Stud_Spacing
  Public Framing_References
  Public UseNog
  Public Nog_Heights
  Public UseServiceHoles
  Public Adjust_Ridge
  Public Auto_Dimension
  Public BPlate_Bolt_Holes
  Public SHole_Openings
  Public SHole_Vertical

  Private Offset
  Private Elevation
  Private MetricCeilingPitch
  Private x
  Private y
  Private StudCenters

  Public Function Height
    Height = PanelWidth / Cos(Alpha) - RidgeOffset
  End Function
  
  Public Function getFrameHeight(iPosition)
    'Returns the height of the top plate for position X
    getFrameHeight = (iPosition * Tan(MetricPitch / 180 * Pi)) + FHeight
  End Function

  Public Function Pitch
    Pitch = 0
  End Function

  Private Function ToRads(Value)
    ToRads = Value * Pi / 180
  End Function

  Private Function ToDegs(Value)
    ToDegs = Value * 180 / Pi
  End Function

  Private Function Alpha
    Alpha = ToRads(MetricCeilingPitch)
  End Function

  Private Function RidgeOffset
    If Adjust_Ridge Then
      RidgeOffset = Tan(Alpha) * CAD.PlateWeb
    Else
      RidgeOffset = 0
    End If
  End Function

  Public Function MetricPitch
    MetricPitch = MetricCeilingPitch
  End Function

  Public Function FHeight
    FHeight = Height
  End Function

  Public Function AddPlacedStudCenter(Position)
    If IsEmpty(StudCenters) Then
      Redim StudCenters(0)
    ElseIf UBound(StudCenters) = -1 Then
      Redim StudCenters(0)
    Else
      Redim Preserve StudCenters(UBound(StudCenters) + 1)
    End If

    StudCenters(UBound(StudCenters)) = Position
  End Function

  Public Sub Build
    Dim I, MetricPitch
    
    MetricPitch = 0

    If ConvertPitch(CeilingPitch, MetricCeilingPitch) = False Then
      MsgBox "Ceiling Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricCeilingPitch Mod 180 = 90 Then
      MsgBox "90 degree Pitch not allowed", 16
      Exit Sub
    End If

    With CAD
      .AutoExtend = True
      .ClipRef = drRIGHT
      .PlaceFrameObject fotBottomPlate, "0,0", "@" & Length & "<0", FLIPPED, stPlate
      .ClipRef = drLEFT
      TopPlate = .PlaceFrameObject(fotTopPlate, "0," & FHeight, "@" & Length / Cos(MetricPitch / 180 * Pi) & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .ClipRef = drMID

      Studs.SetPositions
      BuildFeatures
      Studs.Place
      SortCenters

      '  tidy up ends of plates if raked
      If MetricPitch <> 0 Then
        If EndStud > -1 Then
          .ExtendToWeb TopPlate, EndStud
        End If
        If FirstStud > -1 Then
          .ExtendToWeb TopPlate, FirstStud
        End If
      End If

      If UseNog Then
        For I = 0 To UBound(Nog_Heights)
          PlaceNogs(Nog_Heights(I))
        Next
      End If

      If UseServiceHoles Then
        PlaceServices(100 + .PlateElevationWidth)
        PlaceServices(Height - 100 - .PlateElevationWidth)
        If UseNog Then
          For I = 0 To UBound(Nog_Heights)
            PlaceServices(Nog_Heights(I) - 100 - .PlateElevationWidth/2)
            PlaceServices(Nog_Heights(I) + 100 + .PlateElevationWidth/2)
          Next
        End If
      End If

      .FrameElevation = Tan(Alpha) + (CAD.PlateWeb / Cos(Alpha))
      .FramePitch = -90 + MetricCeilingPitch

    End With

    Select Case Left((Auto_Dimension(CAD.GetListIndex (Me, "Auto_Dimension"))), 1)
      Case 1 'Frame Dimensions Only
        DimensionFrame
      Case 2 'Features Only (Openings Dimensioned Internally)
        DimensionFeatures True, Dimension_Offset(locationBOTTOM), Dimension_Offset(locationLEFT)
      Case 3 'Features Only (Openings Dimensioned Externally)
        DimensionFeatures False, Dimension_Offset(locationBOTTOM), Dimension_Offset(locationLEFT)
      Case 4 'Everything (Openings Dimensioned Internally)
        DimensionFrame
        DimensionFeatures True, 1 + Dimension_Offset(locationBOTTOM), 1 + Dimension_Offset(locationLEFT)
      Case 5 'Everything (Openings Dimensioned Externally)
        DimensionFrame
        DimensionFeatures False, 1 + Dimension_Offset(locationBOTTOM), 1 + Dimension_Offset(locationLEFT)
    End Select

  End Sub


  Public Sub dimensionframe
    'Dimension the frame external measurements
    CAD.PlaceDimension "0,0", Length & ",0", Length / 2 & "," & -(iDimensionFirstSpace + (Dimension_Offset(locationBOTTOM) * iDimensionSpacing)), 1, -2, iDimensionFontSize, "H"
    CAD.PlaceDimension "0,0","0," & Height, -(iDimensionFirstSpace + (Dimension_Offset(locationLEFT) * iDimensionSpacing)) & "," & Height / 2, 1, -2, iDimensionFontSize, "V" 
  End Sub

  Public Function Pick
    Dim Result
    Result = CAD.PickDistanceToPointEx("Pick point on opposite side")

    If Not IsEmpty(Result) Then
      PanelWidth = Result(1)
    End If
  End Function

   Public Function PickArrayEx(AttributeName)
    Dim Result

    PickArrayEx = 0

    If AttributeName = "Framing_References" Then
      Result = CAD.PickFrameReference("Pick a frame reference")    
      If Not IsEmpty(Result) Then
        PickArrayEx = Result
      End If
    ElseIf AttributeName = "Nog_Heights" Then
      Result = CAD.PickElevationPoints(1, "Pick Nog Height")
      If Not IsEmpty(Result) Then
        PickArrayEx = Result(1)
      End If
    End If
  End Function

  'Sort Centers by distance from 0
  Private Sub SortCenters
    Dim V,I,O

    If UBound(StudCenters)> -1 Then
      For O = 0 To UBound(StudCenters) - 1
        For I = O + 1 To UBound(StudCenters)
          If StudCenters(O) > StudCenters(I) Then
            V = StudCenters(O)
            StudCenters(O) = StudCenters(I)
            StudCenters(I) = V
          End If
        Next
      Next
    End If  
  End Sub


  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Length")
  End Function


  Private Sub Class_Initialize()
    Length = CAD.FrameLength("Length")
    PanelWidth = 2440.0
    CeilingPitch = "4:12"
    Stud_Spacing = 600.0
    Framing_References = Array(0.0)
    UseNog = True
    Nog_Heights = Array(1210.0)
    UseServiceHoles = True
    Adjust_Ridge = False
    BPlate_Bolt_Holes = False
    SHole_Openings = True
    SHole_Vertical = False
    Auto_Dimension = Array("0 - No Dimensions" _
                         , "1 - Frame Dimensions Only" _
                         , "2 - Features Only (Openings Dimensioned Internally)" _
                         , "3 - Features Only (Openings Dimensioned Externally)" _
                         , "4 - Everything (Openings Dimensioned Internally)" _
                         , "5 - Everything (Openings Dimensioned Externally)")
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
