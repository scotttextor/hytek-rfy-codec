'[FCAD2000-0]
'[ALL]

'******************************************************************************
'
'   Default script
'
'   Proforma script
'
'   23rd Jan 2001
'
'******************************************************************************

'******************************************************************************
'  Constants
'******************************************************************************

Include "Constants.inc"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder
    
    '  Declare variables that appear in properties inspector here
    
    'Public AVariable
    'Public zz
    
    '  Build - must be present. Used to build frame
    
    Public Sub Build
        
        '  Build code in here
    End Sub
    
    '  PickArray optional. Uses CAD pick methods to set array variables
    
    '    Public Function PickArray
    '        Result = CAD.PickFrameReference("Pick frame reference")
    '        If Not IsEmpty(Result) Then
    '             PickArray = Result
    '        Else
    '             PickArray = 0
    '        End If
    '    End Function
    
    Private Sub Class_Initialize()
        
        '  Initialisation code here
        'zz=Array()
    End Sub
    
End Class

'******************************************************************************
'   Example feature class
'******************************************************************************

Class TFeature
    
    '  Declare variables that appear in properties inspector here
    'Public Head
    '  Build - must be present. Used to build feature
    
    Public Sub Build
        
        '  Build code in here
        
    End Sub
    
    '  Extents - must be present. Returns array of top, left, bottom, right values that enclose feature
    '  used to determine if another element clashes with a frame feature
    
    Public Function Extents
        'Extents = Array(Builder.Height, Offset - .StudElevationWidth, 0, Offset + Width + .StudElevationWidth)
    End Function
    
    '  Pick - optional. Uses CAD pick methods to set variables
    
    Public Sub Pick
        '        Result = CAD.PickOffsetWidth("Pick two points to position door")
        '        If Not IsEmpty(Result) Then
        '             Offset = Result(0)
        '             Width = Result(1)
        '        End If
    End Sub
    
    '  GetPosition - optional. Used to place feature on plan view. If not present then feature is invisible
    
    Public Function GetPosition
        GetPosition = Array(Offset, Width)
    End Function
    
    Private Sub Class_Initialize()
        
        '  Initialisation code here
    End Sub
    
End Class

'******************************************************************************
'  Create an instance of CAD interface and TBuilder
'******************************************************************************

Dim CAD
Set CAD = CmdCADInterface
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
Dim fso, f, str

    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.OpenTextFile(File,1)
    str = f.ReadAll
    f.Close
    ExecuteGlobal str
End Sub
