Option Explicit
'******************************************************************************
'
'  AutoWall Stud Class.inc
'
'  Include file for Load bearing stud placement in wall
'  Utilises frame reference array passed as parameter
'
'  Created - 1st Mar 2001
'
'******************************************************************************

'******************************************************************************
'   Constants globals
'******************************************************************************

Const    pmNormal    =   0
Const    pmBack      =   1
Const    pmFwd       =   2

'******************************************************************************
'   Global instance of class
'******************************************************************************

Dim Studs
Set Studs = New TStud

'******************************************************************************
'
'   TStud
'
'   Implements placement of studs using frame reference array
'   Accesses global Builder & CAD instances
'
'******************************************************************************

Class TStud

Private tRefs
Private pmCode
Private Index
Private ETop
Private ELeft
Private EBottom
Private ERight

Public Sub Place
    Dim F, SP,EP, endPoint
    Dim EnvelopeIntersections,EnvelopeIntersectionsB,I,J

    CAD.DrawingExtents ETop, ELeft, EBottom, ERight
    '  Sort Frame references by value into local copy
    SortRefs

    With Builder
        CAD.ClipRef = drMID

        for I = 0 to UBound(tRefs)
            EnvelopeIntersections = TM.EnvelopeAlongX(tRefs(I) - CAD.StudElevationWidth / 2, True)

            for J = 0 to ((UBound(EnvelopeIntersections)-1)/ 2)
                SP = EnvelopeIntersections(J*2+1,0)
                EP = EnvelopeIntersections(J*2,0)
                PlaceStud EP,SP,False
            next
        next

    End With
End Sub

'  Place stud at Pos if not over end studs or a feature
'  flipped if flag set

Private Function PlaceStud(StartPos,EndPos,Flipped)
    Dim F,I,StartID,EndID

    With Builder
        I = -1
        StartID = CAD.LineHit(StartPos)
        EndID = CAD.LineHit(EndPos)

        If Flipped Then
            I = CAD.PlaceFrameObject(fotStud,StartPos,EndPos, FLIPPED, stStud)
        Else
            I = CAD.PlaceFrameObject(fotStud,StartPos,EndPos, NOT_FLIPPED, stStud)
        End If

        if I <> -1 then
            CAD.ExtendCode = ecEnd
            CAD.ExtendToPolygon I,EndID,EndPos
            CAD.ExtendCode = ecStart
            CAD.ExtendToPolygon I,StartID,StartPos
        End If

        PlaceStud = I
    End With
End Function

Private Sub SortRefs
    Dim V,I,O

    tRefs = Builder.Rafters
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

Private Sub Class_Initialize()
End Sub

End Class
