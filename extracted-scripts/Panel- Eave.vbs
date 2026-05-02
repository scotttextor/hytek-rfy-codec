'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Eave Panel Script
'
'   Creates panel to form flat eave
'
'  20 Nov 2005    N.Penny     Created
'  21 Sep 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"
Include "ConvertPitch.incx"

'*******************************************************************************
'  Panel end types
'*******************************************************************************

Const stHip = 0
Const stStop = 1
Const stValley = 2
Const stCenter = 3

Const stBracketLeft = 0
Const stBracketRight = 1

Const stPickTrussCentre = 0
Const stPickTrussLeading = 1
Const stPickTrussObject = 2

'*******************************************************************************
'  Global references
'*******************************************************************************
Dim TopPlate, OK

'*******************************************************************************
'  Main script class to implement build functions
'*******************************************************************************

Class TBuilder

  Public Length
  Public Width
  Public StartType
  Public EndType
  Public TrussPositions
  Public RoofPitch
  Public TrussHeight
  Public FasciaHeight
  Public Clearance
  Public BracketFixing
  Public RafterDepth
  Public MaxFasciaSpan
  Public MinDistToTruss
  Public PickMethod
  Public Auto_Dimension

  Private NogHeight
  Private MetricPitch

  Public Function FHeight
    FHeight = (Offset * Tan(MetricPitch / 180 * Pi)) + Height
  End Function

  Public Sub Build
    Dim LeftType, RightType, StudDirection
    Dim A, Pb, PtLeft, PtRight, Ng
    Dim ValleyExtension
    ReDim StudPositions(UBound(TrussPositions))
    Dim i, j, k, LeftStud, RightStud, RemovedStuds

    'Convert pitch to Rise over Run if needed
    If ConvertPitch(RoofPitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    With CAD

      'Set Variables
      ValleyExtension = 100.0

      'Set Calculated Variables
      NogHeight = Width - ((.PlateWeb - FasciaHeight) / Tan(MetricPitch / 180 * Pi)) - (RafterDepth / Sin(MetricPitch / 180 * Pi)) - (Clearance / Tan(MetricPitch / 180 * Pi))
      If NogHeight > Width Then
        NogHeight = 600.0
      End If
      LeftType = .GetListIndex (Me, "StartType")
      RightType = .GetListIndex (Me, "EndType")

      'Set Stud Direction based on Fascia Bracket Fixing
      Select Case .GetListIndex (Me, "BracketFixing")
        Case stBracketLeft 'Left Bracket Fixing  (Stud Direction is Normal)
          StudDirection = 0
        Case stBracketRight 'Right Bracket Fixing  (Stud Direction is End)
          StudDirection = 1
      End Select

      'Start Placing Sections
      .AutoExtend = True
      .ClipRef = drRIGHT
      Pb = .PlaceFrameObject(fotBottomPlate, "0,0", "@" & Length & "<0", FLIPPED, stPlate)

      'Place Nogline
      .ClipRef = drLEFT
      Ng = .PlaceFrameObject(fotNog, "0," & NogHeight, "@" & Length & "<0", NOT_FLIPPED, stPlate)

      'Place Left End
      Select Case LeftType
        'Hip or Gable End
        Case stHip
          'MsgBox "Left is Hip or Gable"
          LeftStud = (Width /2)
          .ClipRef = drLEFT
          .PlaceFrameObject fotStud, "0,0", "@" & NogHeight & "<90", NOT_FLIPPED, stStud
          If StudDirection = 0 Then
            .PlaceFrameObject fotStud, (Width /2) - (.StudElevationWidth /2) & ",0", "@" & Width & "<90", FLIPPED, stStud
          Else 'StudDirection = 1 Then
            .PlaceFrameObject fotStud, (Width /2) - (.StudElevationWidth /2) & ",0", "@" & Width & "<90", NOT_FLIPPED, stStud
          End If

          If Auto_Dimension = True Then
            .PlaceLabel "Hip End", "0," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
          End If

        'Stop End (Connects to Hip, Gable or Valley)
        Case stStop
          'MsgBox "Left is Stop"
          LeftStud = .StudElevationWidth /2
          .ClipRef = drLEFT
          If NogHeight + 20 <= Width Then
            .PlaceFrameObject fotStud, "0,0", "@" & NogHeight + 20 & "<90", NOT_FLIPPED, stStud
          ElseIf NogHeight <= Width Then
            .PlaceFrameObject fotStud, "0,0", "@" & Width & "<90", NOT_FLIPPED, stStud
          Else
            .PlaceFrameObject fotStud, "0,0", "@" & NogHeight & "<90", NOT_FLIPPED, stStud
          End If

          If Auto_Dimension = True Then
            .PlaceLabel "Stop End", "0," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
          End If

        'Valley
        Case stValley
          'MsgBox "Left is Valley"
          LeftStud = Width + ValleyExtension - .StudElevationWidth /2
          .ClipRef = drLEFT
          PtLeft = .PlaceFrameObject(fotTopPlate, "0," & Width, "@" & Width + ValleyExtension & "<0", NOT_FLIPPED, stPlate)
          .PlaceFrameObject fotStud, "0,0", "@" & Width & "<90", NOT_FLIPPED, stStud
          .ClipRef = drRight
          .PlaceFrameObject fotStud, Width + ValleyExtension & ",0", "@" & Width & "<90", FLIPPED, stStud
          If NogHeight > Width - .StudElevationWidth Then
            A = .PlaceLine(Width + ValleyExtension - .StudElevationWidth & ",0", "@" & Width + 100 & "<90")
            .AutoExtend = False
            .Extend Ng, A
            .AutoExtend = True
          End If

          If Auto_Dimension = True Then
            .PlaceLabel "Valley", "0," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
          End If

        'Center Join
        Case stCenter
          If StudDirection = 0 Then
            'MsgBox "Left is Center Join (Short Stud)"
            LeftStud = .StudElevationWidth /2
            .ClipRef = drLEFT
            If NogHeight + 20 <= Width Then
              .PlaceFrameObject fotStud, "0,0", "@" & NogHeight + 20 & "<90", NOT_FLIPPED, stStud
            ElseIf NogHeight <= Width Then
              .PlaceFrameObject fotStud, "0,0", "@" & Width & "<90", NOT_FLIPPED, stStud
            Else
              .PlaceFrameObject fotStud, "0,0", "@" & NogHeight & "<90", NOT_FLIPPED, stStud
            End If
          Else 'If StudDirection = 1 Then
            'MsgBox "Left is Center Join (Long Stud)"
            .ClipRef = drLEFT
            .PlaceFrameObject fotStud, "0,0", "@" & Width & "<90", NOT_FLIPPED, stStud
          End If

          If Auto_Dimension = True Then
            .PlaceLabel "Center Join", "0," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
          End If
        End Select

        'Place Right End
        Select Case RightType
          'Hip or Gable
          Case stHip
            'MsgBox "Right is Hip or Gable"
            RightStud = Length - (Width/2)
            .ClipRef = drRIGHT
            .PlaceFrameObject fotStud, Length & ",0", "@" & NogHeight & "<90", FLIPPED, stStud
            .ClipRef = drLEFT
            If StudDirection = 0 Then
              .PlaceFrameObject fotStud, Length - ((Width /2) + (.StudElevationWidth /2)) & ",0", "@" & Width & "<90", FLIPPED, stStud
            Else 'StudDirection = 1 Then
              .PlaceFrameObject fotStud, Length - ((Width /2) + (.StudElevationWidth /2)) & ",0", "@" & Width & "<90", NOT_FLIPPED, stStud
            End If

            If Auto_Dimension = True Then
              .PlaceLabel "Hip End", Length - .TextWidth("Hip End", iDimensionFontSize) & "," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
            End If
          'Stop End (Connects to Hip, Gable or Valley)
          Case stStop
            'MsgBox "Right is Stop"
            RightStud = Length - (.StudElevationWidth /2)
            .ClipRef = drRIGHT
            If NogHeight + 20 <= Width Then
              .PlaceFrameObject fotStud, Length & ",0", "@" & NogHeight + 20 & "<90", FLIPPED, stStud
            ElseIf NogHeight <= Width Then
              .PlaceFrameObject fotStud, Length & ",0", "@" & Width & "<90", FLIPPED, stStud
            Else
              .PlaceFrameObject fotStud, Length & ",0", "@" & NogHeight & "<90", FLIPPED, stStud
            End If

            If Auto_Dimension = True Then
              .PlaceLabel "Stop End", Length - .TextWidth("Stop End", iDimensionFontSize) & "," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
            End If

          'Valley
          Case stValley
            'MsgBox "Right is Valley"
            RightStud = Length - (Width + ValleyExtension - (.StudElevationWidth /2))
            .ClipRef = drLEFT
            PtRight = .PlaceFrameObject(fotTopPlate, Length - (Width + ValleyExtension) & "," & Width, "@" & Width + ValleyExtension & "<0", NOT_FLIPPED, stPlate)
            .PlaceFrameObject fotStud, Length - (Width + ValleyExtension) & ",0", "@" & Width & "<90", NOT_FLIPPED, stStud
            .ClipRef = drRight
            .PlaceFrameObject fotStud, Length & ",0", "@" & Width & "<90", FLIPPED, stStud
            If NogHeight > Width - .StudElevationWidth Then
              A = .PlaceLine(Length - (Width + ValleyExtension - .StudElevationWidth) & ",0", "@" & Width + 100 & "<90")
              .AutoExtend = False
              .Extend Ng, A
              .AutoExtend = True
            End If

            If Auto_Dimension = True Then
              .PlaceLabel "Valley", Length - .TextWidth("Valley", iDimensionFontSize) & "," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
            End If

          'Centre Join
          Case stCenter
            RightStud = Length - (.StudElevationWidth/2)
            If StudDirection = 0 Then
              'MsgBox "Right is Center Join (Long Stud)"
              .ClipRef = drRight
              .PlaceFrameObject fotStud, Length & ",0", "@" & Width & "<90", FLIPPED, stStud
            Else 'If StudDirection = 1 Then
              'MsgBox "Right is Center Join (Short Stud)"
              .ClipRef = drRIGHT
              If NogHeight + 20 <= Width Then
                .PlaceFrameObject fotStud, Length & ",0", "@" & NogHeight + 20 & "<90", FLIPPED, stStud
              ElseIf NogHeight <= Width Then
                .PlaceFrameObject fotStud, Length & ",0", "@" & Width & "<90", FLIPPED, stStud
              Else
                .PlaceFrameObject fotStud, Length & ",0", "@" & NogHeight & "<90", FLIPPED, stStud
              End If
            End If

            If Auto_Dimension = True Then
              .PlaceLabel "Center Join", Length - .TextWidth("Center Join", iDimensionFontSize)& "," & Width + iDimensionFirstSpace, iDimensionFontSize, 0
            End If
        End Select

        'Sort
        Dim v, o

        For i = 0 To UBound(TrussPositions)
          TrussPositions(i) = CDbl(TrussPositions(i))
        Next
        If UBound(TrussPositions)> -1 Then
          For o = 1 To UBound(TrussPositions) - 1
            For i = o + 1 To UBound(TrussPositions)
              If TrussPositions(o) > TrussPositions(i) Then
                v = TrussPositions(o)
                TrussPositions(o) = TrussPositions(i)
                TrussPositions(i) = v
              End If
            Next
          Next
        Else
          TrussPositions = Array(0.0)
        End If

      'Find Stud Centers
      'If stud is within MinDistToTruss of end connection type studs, do not place
      j = 0
      For i = 0 to UBound(TrussPositions)
        If StudDirection = 0 Then  'Stud is on the left of the truss
          If TrussPositions(i) + MinDistToTruss <= RightStud Then 'And TrussPositions(i+1) - TrussPositions(i) <= MaxFasciaSpan Then
            StudPositions(j) = TrussPositions(i) + (.StudElevationWidth + (.PlateWeb /2))
            j = j + 1
          End If
        Else 'If Stud Direction = 1  'Stud is on right of the truss
          If TrussPositions(i) - MinDistToTruss >= LeftStud Then 'And TrussPositions(i) - TrussPositions(i-1) <= MaxFasciaSpan Then
            StudPositions(j) = TrussPositions(i) - (.StudElevationWidth + (.PlateWeb /2))
            j = j + 1
          End If
        End If
      Next
      ReDim Preserve StudPositions(j-1)

      'Remove studs if they are less than MinDistToTruss from the truss on the bracket face
      RemovedStuds = 0

      If StudDirection = 0 Then 'Check for truss on left side
        For i = 0 to UBound(StudPositions)
          For j = 0 to UBound(TrussPositions)
            If (TrussPositions(j) - .PlateWeb /2) - MinDistToTruss > StudPositions(i) + (.StudElevationWidth /2) Then
              Exit For
            ElseIf (TrussPositions(j) + .PlateWeb /2) >= StudPositions(i) - .StudElevationWidth /2 Then
              For k = i to UBound(StudPositions) -1
                StudPositions(k) = StudPositions(k+1)
              Next
              RemovedStuds = RemovedStuds +1
            End If
          Next
        Next
      Else 'If Stud Direction = 1 Then 'Check for truss on right side
        For i = 0 to UBound(StudPositions)
          For j = 0 to UBound(TrussPositions)
            If (TrussPositions(j) + .PlateWeb /2) + MinDistToTruss < StudPositions(i) - (.StudElevationWidth /2) Then
              Exit For
            ElseIf (TrussPositions(j) - .PlateWeb /2) <= StudPositions(i) + .StudElevationWidth /2 Then
              For k = i to UBound(StudPositions) -1
                StudPositions(k) = StudPositions(k+1)
              Next
              RemovedStuds = RemovedStuds +1
            End If
          Next
        Next
      End If

      'Remove studs if surrounding studs are less than MaxFasciaSpan
      RemovedStuds = 0

      For i = 1 to UBound(StudPositions) -1
        If StudPositions(i+1) - StudPositions(i-1) < MaxFasciaSpan Then
          For k = i to UBound(StudPositions) -1
            StudPositions(k) = StudPositions(k+1)
          Next
          RemovedStuds = RemovedStuds +1
        End If
      Next

      If RemovedStuds > 0 Then
        ReDim Preserve StudPositions(UBound(StudPositions)-RemovedStuds)
      End If

      'Find out if any distance between 2 adjacent studs is more than MaxFasciaSpan
      Dim MaxFasciaSpanExceeded
      MaxFasciaSpanExceeded = False

      For i = 0 to UBound(StudPositions) -1
        If StudPositions(i+1) - StudPositions(i) > MaxFasciaSpan + 0.1 Then
          MaxFasciaSpanExceeded = True
        End If
      Next

      'Draw Studs
      .ClipRef = drMID
      If StudDirection = 0 Then 'Stud is on the left of the truss
        For i = 0 to UBound(StudPositions)
          '.PlaceLine StudPositions(i) & ",0","@" & Width & "<90"
          .PlaceFrameObject fotStud, StudPositions(i) & ",0", "@" & Width & "<90", FLIPPED, stStud
        Next
      Else 'If Stud Direction = 1 Then 'Stud is on right of the truss
        For i = 0 to UBound(StudPositions)
          '.PlaceLine StudPositions(i) & ",0","@" & Width & "<90"
          .PlaceFrameObject fotStud, StudPositions(i) & ",0", "@" & Width & "<90", NOT_FLIPPED, stStud
        Next
      End If

      'Label Truss Position
      Dim TrussLength

      If .TextWidth("Truss Positions", .PlateWeb - 15) > Width + 100 Then
        TrussLength = .TextWidth("Truss Positions", .PlateWeb - 15)
      Else
        TrussLength = Width + 100
      End If

      For j = 0 to UBound(TrussPositions)
        .PlaceLabel "Truss Position", TrussPositions(j) + .PlateWeb/2 & "," & Width - 10, .PlateWeb -15, 270
        .PlaceLine TrussPositions(j) - .PlateWeb /2 & "," & Width,"@" & TrussLength & "<270"
        .PlaceLine TrussPositions(j) + .PlateWeb /2 & "," & Width,"@" & TrussLength & "<270"
        .PlaceLine TrussPositions(j) - .PlateWeb /2 & "," & Width,"@" & .PlateWeb & "<0"
      Next

      'Set 3D Variables
      .FrameElevation = -(Tan(MetricPitch / 180 * Pi) * Width + FasciaHeight - TrussHeight - .PlateWeb)
      .FramePitch = -90

      'Place Dimensions
      dimensionframe

      'Display Warning If MaxFasciaSpan has been exceeded (MaxFasciaSpanExceeded = True)
      If MaxFasciaSpanExceeded = True Then MsgBox "Maximum Fascia Span has been exceeded." & vbCr & "Consider additional support.", vbCritical, "FRAMECAD - Warning"
    End With
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Length")
  End Function

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    CAD.PlaceDimension "0,0", Length & ",0", Length/2 & "," & -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"
    CAD.PlaceDimension "0,0", "0," & Width, -iDimensionFirstSpace & "," & Width/2,1,-2,iDimensionFontSize,"V"
  End Sub

  'Pick Width
  Public Function Pick
    Dim Result
    Result = CAD.PickDistanceToPointEx("Pick Eave Line")
    If Not IsEmpty(Result) Then
      Width = Result(1)
    End If
  End Function

  'Pick Truss Positions
  Public Function PickArray
    Dim Result
    Select Case CAD.GetListIndex (Me, "PickMethod")
      Case stPickTrussCentre
        Result = CAD.PickFrameReference("Pick Truss Center")
        If Not IsEmpty(Result) Then
          If Result < 0 Then
            Result = -Result
          End If
          PickArray = Result
        Else
          PickArray = 0
        End If
      Case stPickTrussLeading
        Result = CAD.PickFrameReference("Pick Leading Edge Of Truss")
        If Not IsEmpty(Result) Then
          If Result < 0 Then
            Result = -Result
          End If
          PickArray = Result + 44.5
        Else
          PickArray = 0
        End If
      Case stPickTrussObject
        Result = CAD.PickStick("Pick Truss")
        If Not IsEmpty(Result) Then
          PickArray = Result(0) + (Result(1) /2)
        End If
    End Select
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("Length")
    Width = 600.0
    StartType = Array("Hip or Gable", "Stop End", "Valley", "Center Join")
    EndType = Array("Hip or Gable", "Stop End", "Valley", "Center Join")
    TrussPositions = Array(100.0, 200.0)
    RoofPitch = "20"
    TrussHeight = 100.0
    FasciaHeight = 100.0
    Clearance = 0.0
    BracketFixing = Array("Left", "Right")
    RafterDepth = 41.0
    MaxFasciaSpan = 900.0
    MinDistToTruss = 200.0
    PickMethod = Array("Centre Line Of Truss", "Leading Edge Of Truss", "Truss")
    Auto_Dimension = True
  End Sub
End Class


'*******************************************************************************
'  Include
'
'  Includes external source files
'
'*******************************************************************************
Sub Include(File)
  Dim fso, f, Str
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.OpenTextFile(File, 1)
  Str = f.ReadAll
  f.Close
  ExecuteGlobal Str
End Sub
