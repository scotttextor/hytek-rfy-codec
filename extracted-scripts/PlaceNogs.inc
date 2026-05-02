'******************************************************************************
'
'  PlaceNogs.inc
'
'  Include file for nog placement in walls
'
'  Created - 27th Feb 2001
'  Modified - 21 Sep 2004 by John Burns
'  Questions? jb@metalformingtech.com
'
'******************************************************************************

Sub PlaceNogs(Height)
    Dim Dist, I, F
    With CAD
        .ClipRef = drMID
        If Features.Count = 0 Then
            .PlaceFrameObject fotNog, "0," & Height, "@" & Builder.Length & "<0", NOT_FLIPPED, stPlate
        Else
            Dist = 0
            nogstart = 0
            nogend = 0
            
            For I = 0 To Features.Count - 1
                Set F = GetNextLeftFeature(Dist)
                If OK Then
                    dist = F.FOffset + F.FWidth
                     
                    ' Handle case when feature is right at the start of the frame
                    ' and enable the nog to start at the end of the feature
                    If F.FOffset < CAD.StudElevationWidth Then
                        Select Case F.GetType
                            Case "BeamPockets", "Triples"
                                If Not (F.NogPassThrough(Height, CAD.PlateElevationWidth) = True) Then nogstart = F.FWidth
                            Case Else
                                'Let the nog go through
                        End Select
                    End If
                    
                    Select Case F.GetType
                        Case "Window", "Door", "BeamPockets", "Triples"
                            If Not (F.NogPassThrough(Height, CAD.PlateElevationWidth) = True) Then nogend = F.FOffset
                        Case Else
                            'Let the nog go through
                    End Select
                    
                    If nogend > nogstart Then
                        If nogend > nogstart + 100 Then
                            .PlaceFrameObject fotNog, nogstart & "," & Height, "@" & nogend - nogstart & "<0", NOT_FLIPPED, stPlate
                        End If
                        nogstart = F.FOffset + F.FWidth
                    End If
                    
                    If F.FOffset > Dist + 100 Then
                        .PlaceFrameObject fotNog, Dist & "," & Height, "@" & F.FOffset - Dist & "<0", NOT_FLIPPED, stPlate
                    End If
                    Dist = F.FOffset + F.FWidth
                End If
            Next
            If nogstart + 100 < Builder.Length Then
                .PlaceFrameObject fotNog, nogstart & "," & Height, "@" & Builder.Length - nogstart & "<0", NOT_FLIPPED, stPlate
            End If
        End If
        
    End With
End Sub
