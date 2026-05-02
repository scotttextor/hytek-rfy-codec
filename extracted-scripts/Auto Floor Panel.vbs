'[FCAD2000-0]
'[FLOOR_PANEL] 

Option Explicit 

'******************************************************************************
'
'   Basic auto configured floor panel
'
'   Produces floor panel for production by FRAMECAD FL650
'   Uses frame reference array to govern joist placement
'
'   18th June 2010
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"
Include "Features.incx"
Include "AutoFloor Joist Class.incx"
Include "AutoFloor Opening.incx"
Include "Build Envelope.incx"
Include "libGeneral.incx"
Include "DivideSpace.incx"

Dim OK

'******************************************************************************
'   GetFeatures
'******************************************************************************

Function GetFeatures
     GetFeatures = Array("Openings")
End Function

'******************************************************************************
'   MakeFeature
'******************************************************************************

Function MakeFeature(ClassName, Name)
    Select Case ClassName
       Case "Openings"  Features.Add Name, New TOpening
                     Set MakeFeature = Features.Item(Name)
       Case "Triples"  Features.Add Name, New TTriple
                     Set MakeFeature = Features.Item(Name)
       Case Else MsgBox "Unknown class - " & ClassName
    End Select
End Function

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

Public Length
Public Joist_Spacing
Public Joist_References
Public Auto_Dimension

Private ETop
Private ELeft
Private EBottom
Private ERight

    Public Function FHeight
        FHeight = (Offset * Tan(Pitch/180*Pi)) + Height
    End Function

    Public Function ListBtnPickEnabled(aAttributeName)
        if aAttributeName = "Joist_References" then
            ListBtnPickEnabled = True
        end if
    End Function	
    
    Public Sub Build
    Dim HSticks() 
    Dim CurrentStick, YPos, J, XPos, VSticks(), current,x,I
          With CAD
            .AutoExtend = True
      
      BuildEnvelope TM
      
      BuildFeatures
      
      Joists.Place
                 
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

          End With
    End Sub

    Public Sub dimensionframe
        CAD.PlaceDimension TM.MinX & "," & TM.MinY, TM.MaxX & "," & TM.MinY, "0," & TM.MinY - (iDimensionFirstSpace + (Dimension_Offset(locationBOTTOM) * iDimensionSpacing)), 1, -2, iDimensionFontSize, "H"
        CAD.PlaceDimension TM.MinX & "," & TM.MinY, TM.MinX & "," & TM.MaxY, TM.MinX - (iDimensionFirstSpace + (Dimension_Offset(locationLEFT) * iDimensionSpacing)) & ",0", 1, -2, iDimensionFontSize, "V"
        If CAD.FramePitch <> 0 then
              CAD.PlaceLabel "Pitch: " & (90 + CAD.FramePitch) & Chr(176), TM.MinX - (iDimensionFirstSpace + (Dimension_Offset(locationLEFT) * iDimensionSpacing)) & "," & TM.MinY - (iDimensionFirstSpace + (Dimension_Offset(locationBOTTOM) * iDimensionSpacing)) + iDimensionFontSize, iDimensionFontSize, 0 
        End If
    End Sub

    Public Function ReadOnlyAttributes
        ReadOnlyAttributes = Array("Length")
    End Function
    
    Public Function PickArrayEx(AttributeName)
        Dim Result
        Result = CAD.PickFrameReference("Pick a grid reference")
        
        If Not IsEmpty(Result) Then
            PickArrayEx = Result
        Else
            PickArrayEx = 0
        End If
    End Function
    
    Private Sub Class_Initialize()
        CAD.DrawingExtents ETop,ELeft,EBottom,ERight
        Length = CAD.FrameLength("Length")
        Joist_Spacing = 400.0
        Joist_References = Array(0.0)
        Auto_Dimension = Array("0 - No Dimensions" _
                             , "1 - Frame Dimensions Only" _
                             , "2 - Features Only (Openings Dimensioned Internally)" _
                             , "3 - Features Only (Openings Dimensioned Externally)" _
                             , "4 - Everything (Openings Dimensioned Internally)" _
                             , "5 - Everything (Openings Dimensioned Externally)")
        Set TM = CAD.TemplateManager
    End Sub

End Class

'******************************************************************************
'  Include
'
'  Includes external source files
'
'******************************************************************************

Sub Include(File)
Dim fso, f, str

    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.OpenTextFile(File,1)
    str = f.ReadAll
    f.Close
    ExecuteGlobal str
End Sub
