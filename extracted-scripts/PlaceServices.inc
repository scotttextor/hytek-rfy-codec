'******************************************************************************
'
'  PlaceServices.inc
'
'  Include file for Service Hole Route placement in walls
'
'  Created - 27th Feb 2001
'  Modified - 21 Sep 2004 by John Burns
'  Questions? jb@metalformingtech.com
'
'******************************************************************************

Sub PlaceServices(Height)
    Dim Dist, I, F
    With CAD
        
        If Features.Count = 0 Then
            .PlaceServiceHoles "0," & Height, "@" & Builder.Length & "<0"
        Else
            dist = 0
            servicestart = -100
            serviceend = -100
            serviceclearance = 50
            
            For I = 0 To Features.Count + 1
                Set F = GetNextLeftFeature(dist)
                If OK Then
                    dist = F.FOffset + F.FWidth
                    Select Case F.GetType
                        Case "Window"
                            If Not (F.Sill >= Height + serviceclearance Or F.TotalHead <= Height - serviceclearance) Then serviceend = F.FOffset
                        Case "Door"
                            If Not F.TotalHead <= Height - serviceclearance Then serviceend = F.FOffset
                        Case Else
                            'Let the service hole go through
                    End Select
                    
                    If serviceend > servicestart Then
                        .PlaceServiceHoles servicestart + 50 & "," & Height, serviceend -50 & "," & Height
                        servicestart = F.FOffset + F.FWidth
                    End If
                End If
            Next
            
            .PlaceServiceHoles servicestart + 50 & "," & Height, Builder.Length + 50 & "," & Height
        End If
    End With
End Sub
