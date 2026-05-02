Option Explicit
'******************************************************************************
'
'  Panel Grid Stud Class.inc
'
'  Include file for placing stud grid on roof panels
'  Utilises frame reference array passed as parameter
'
'  Created - 2nd Mar 2004
'
'******************************************************************************

'******************************************************************************
'   Constants globals
'******************************************************************************

Const pmNormal = 0
Const pmBack = 1
Const pmFwd = 2

Const orVertical = 0
Const orHorizontal = 1

'******************************************************************************
'   Global instance of class
'******************************************************************************

Dim Grid
Set Grid = New TGrid

'******************************************************************************
'
'   TGrid
'
'   Implements placement of studs using frame reference array
'   Accesses global Builder & CAD instances
'
'******************************************************************************

Class TGrid
    
    Public StartClippers()
    Public EndClippers()
    
    Private tRefs
    Private pmCode
    Private Index
    Private Left
    Private Orientation
    
    Public Sub InitArrays
        Erase StartClippers
        Erase EndClippers
        ReDim StartClippers(1)
        ReDim EndClippers(1)
    End Sub
    
    '  Clip extends passed ID to array of Clippers specifying which end to extend
    
    Private Sub Clip(ID, Which)
        Dim I
        
        If Which = ecStart Then
            For I = 0 To UBound(StartClippers) - 1
                If StartClippers(I) <> -1 Then
                    CAD.ExtendCode = Which
                    CAD.ExtendToInsideWeb ID, StartClippers(I)
                End If
            Next
        Else
            For I = 0 To UBound(EndClippers) - 1
                If EndClippers(I) <> -1 Then
                    CAD.ExtendCode = Which
                    CAD.ExtendToInsideWeb ID, EndClippers(I)
                End If
            Next
        End If
    End Sub
    
    Public Sub AddClipper(ID, Which)
        Dim I
        
        If Which = ecStart Then
            I = UBound(StartClippers) + 1
            ReDim Preserve StartClippers(I)
            StartClippers(I -1) = ID
        Else
            I = UBound(EndClippers) + 1
            ReDim Preserve EndClippers(I)
            EndClippers(I -1) = ID
        End If
    End Sub
    
    Public Sub PlaceHorizontals(XStart, YStart, YEnd)
        Dim F, Pos, endPoint
        
        Orientation = orHorizontal
        Left = XStart
        Pos = - YStart
        Do
            If (Pos >= 1.5 * CAD.PlateElevationWidth) And (Pos <= YEnd - (1.5 * CAD.PlateElevationWidth)) Then
                PlaceStud Pos, False
            End If
            Pos = Pos + Builder.Nog_Spacing
        Loop Until Pos > YEnd
    End Sub
    
    Public Sub PlaceVerticals(XStart, XEnd)
        Dim F, Pos, endPoint
        
        Orientation = orVertical
        
        '  Sort Frame references by value into local copy
        
        SortRefs
        
        '  Set placement method code - if any Ref > Length then work backwards
        '  if any < 0 then work forwards else work back from first Ref and then
        '  forwards.
        
        SetCode XStart, XEnd
        
        '  Set start reference index - Index of first Ref value to use
        
        SetIndex
        
        With Builder
            
            '  Place studs using placement method
            
            '  pmBack - place studs from end back to start of stick, restart at each new Ref
            '  stop when passed start of stick
            
            CAD.ClipRef = drMID
            If pmCode = pmBack Then
                Do
                    Pos = tRefs(Index)
                    Index = Index - 1
                    If Index < 0 Then
                        endPoint = 0
                    Else
                        endPoint = tRefs(Index)
                    End If
                    If endPoint < 0 Then
                        endPoint = 0
                    End If
                    
                    '  Place studs
                    
                    Do
                        If (Pos < XEnd - (1.5 * CAD.StudElevationWidth)) _
                            And (Pos > XStart + (1.5 * CAD.StudElevationWidth)) Then
                            PlaceStud Pos, False
                        End If
                        Pos = Pos - .Stud_Spacing
                    Loop Until Pos <= endPoint
                    
                Loop Until endPoint = 0
            Else
                
                '  pmNormal - place studs from first Ref back to start and then forwards, restarting at each
                '  new Ref value. stop when passed end of stick
                
                If pmCode = pmNormal Then
                    Pos = tRefs(Index)
                    Do
                        If (Pos < XEnd - (1.5 * CAD.StudElevationWidth)) _
                            And (Pos > XStart + (1.5 * CAD.StudElevationWidth)) Then
                            PlaceStud Pos, False
                        End If
                        Pos = Pos - .Stud_Spacing
                    Loop Until Pos <= XStart
                End If
                
                '  pmFwd - place studs forward from first Ref, restarting at each new Ref value
                '  stop when passed end of stick (also if pmNormal)
                
                Do
                    Pos = tRefs(Index)
                    If pmCode = pmNormal Then
                        Pos = Pos + .Stud_Spacing
                        pmCode = pmFwd
                    End If
                    Index = Index + 1
                    If Index > UBound(tRefs) Then
                        endPoint = XEnd
                    Else
                        endPoint = tRefs(Index)
                    End If
                    If endPoint > XEnd Then
                        endPoint = XEnd
                    End If
                    
                    '  Place studs
                    
                    Do
                        If (Pos < XEnd - (1.5 * CAD.StudElevationWidth)) _
                            And (Pos > XStart + (1.5 * CAD.StudElevationWidth)) Then
                            PlaceStud Pos, False
                        End If
                        Pos = Pos + .Stud_Spacing
                    Loop Until Pos >= endPoint
                Loop Until endPoint = XEnd
            End If
        End With
    End Sub
    
    '  Place stud at Pos
    '  flipped if flag set
    
    Private Function PlaceStud(Pos, Flipped)
        Dim F, I
        
        With Builder
            I = -1
            If Orientation = orVertical Then
                If Flipped Then
                    I = CAD.PlaceFrameObject(fotStud, Pos & ",-100" , "@100<90", FLIPPED, stStud)
                Else
                    I = CAD.PlaceFrameObject(fotStud, Pos & ",-100" , "@100<90", NOT_FLIPPED, stStud)
                End If
            Else
                If Flipped Then
                    I = CAD.PlaceFrameObject(fotStud, Left & "," & Pos , "@100<0", FLIPPED, stStud)
                Else
                    I = CAD.PlaceFrameObject(fotStud, Left & "," & Pos , "@100<0", NOT_FLIPPED, stStud)
                End If
            End If
            Clip I, ecEnd
            Clip I, ecStart
            PlaceStud = I
        End With
    End Function
    
    Private Sub SortRefs
        Dim V, I, O
        
        tRefs = Builder.Grid_References
        For I = 0 To UBound(tRefs)
            tRefs(I) = CDbl(tRefs(I))
        Next
        If UBound(tRefs)> -1 Then
            For O = 0 To UBound(tRefs) - 1
                For I = O + 1 To UBound(tRefs)
                    If tRefs(O) > tRefs(I) Then
                        V = tRefs(O)
                        tRefs(O) = tRefs(I)
                        tRefs(I) = V
                    End If
                Next
            Next
        Else
            tRefs = Array(0.0)
        End If
    End Sub
    
    Private Sub SetCode(XStart, XEnd)
        Dim I
        
        pmCode = pmNormal
        If UBound(tRefs)> -1 Then
            If tRefs(0) < XStart Then
                pmCode = pmFwd
            Else
                For I = 0 To UBound(tRefs)
                    If tRefs(I) > XEnd Then
                        pmCode = pmBack
                        Index = I 'set index for later
                        Exit For
                    End If
                Next
            End If
        End If
    End Sub
    
    Private Sub SetIndex
        Dim I
        
        If UBound(tRefs)> -1 Then
            If pmCode = pmFwd Then
                For I = 0 To UBound(tRefs)
                    If tRefs(I) >= 0 Then
                        Index = I - 1
                        Exit For
                    End If
                Next
            ElseIf pmCode = pmNormal Then
                Index = 0
            End If
        End If
    End Sub
    
    Private Sub Class_Initialize()
        InitArrays
        Left = 0.0
    End Sub
    
End Class
