'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'  Gable Outrigger 
'
'  Small frame to build gable outrigger
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"
Include "ConvertPitch.incx"

Class TBuilder

Public Length 
Public Height_At_Wall
Public RoofPitch
Public Offset
Public FasciaDepth
Public FasciaEnd
Public Auto_Dimension

Private MetricRoofPitch

Public Sub Build
    Dim HeightAdjust

    If ConvertPitch(RoofPitch, MetricRoofPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If
    
    With CAD
        HeightAdjust = Height_At_Wall + (Tan(MetricRoofPitch * Pi / 180) * Offset) + (.PlateElevationWidth / Cos(MetricRoofPitch * Pi / 180))

        .AutoExtend = True

        'Create frame
        .ClipRef = drLeft
        .PlaceFrameObject fotTopPlate, "0,0" , Length & ",0", NOT_FLIPPED, stPlate
        
        FasciaEnd = CAD.GetListIndex(Me, "FasciaEnd")

        select case FasciaEnd
            case 0 ' Start 
                .ClipRef = drLeft
                .PlaceFrameObject fotStud, "0," & -FasciaDepth , "0,0", NOT_FLIPPED, stStud
            case 1 ' End
                .ClipRef = drRight
                .PlaceFrameObject fotStud, Length & "," & -FasciaDepth , Length & ",0", FLIPPED, stStud
        end select

            'Clean up mess
            .EraseConstructionLines
            .FrameElevation = HeightAdjust
            .FramePitch = MetricRoofPitch
        End With

        If Auto_Dimension = True Then dimensionframe

        End Sub

        Public Sub dimensionframe
            'Dimension the frame external measurements
            CAD.PlaceDimension "0," & FasciaDepth, Length & "," & FasciaDepth, Length/2 & "," & -iDimensionFirstSpace-FasciaDepth, 1, -2, iDimensionFontSize, "H"
            select case FasciaEnd
                case 0 'Start
                    CAD.PlaceDimension "0,0","0," & -FasciaDepth, -iDimensionFirstSpace & "," & FasciaDepth/2, 1, -2, iDimensionFontSize, "V" 
                case 1 ' End
                    CAD.PlaceDimension Length & ",0", Length & "," & -FasciaDepth, Length + iDimensionFirstSpace & "," & FasciaDepth/2, 1, -2, iDimensionFontSize, "V" 
            end select
        End Sub

        Public Function ReadOnlyAttributes
            ReadOnlyAttributes = Array("Length")
        End Function

        Public Sub Pick
            Dim Result

            Result = CAD.PickDistanceToPointEx("Pick a point on the outside of the wall")
            if not IsEmpty(Result) then
                Offset = Result(4)
            end if
        End Sub

        Private Sub Class_Initialize()
            Length = CAD.FrameLength("")
            Height_At_Wall = 100.0
            RoofPitch = "20"
            Offset = 0.0
            FasciaDepth = 120.0
            FasciaEnd = Array("Start", "End")
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
