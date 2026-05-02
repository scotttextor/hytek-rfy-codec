'[FCAD2000-0]
'[EXTERNAL_WALL]
'[INTERNAL_WALL]
'[TRUSS]
'[JOIST]
'[MISC]

Class TBuilder

    Public Sub Build
    End Sub

    Private Sub Class_Initialize()
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
