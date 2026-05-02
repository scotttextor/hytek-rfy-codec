'******************************************************************************
'
'  PlaceDiscontinousNogs.inc
'
'  Include file for nog placement in walls
'
'  Created - 27th Feb 2001
'  Modified - 21 Sep 2004 by John Burns
'  Questions? jb@metalformingtech.com
'
'******************************************************************************


Private Sub SplitNog(SX,EX,Height,StudCenters,NogOffset,SkipNogs,SkipFirst)
  CAD.AutoExtend = False
  Dim I,LastX,aHeight,NogUp
  
  NogUp = True
  UseSkip = False
  if SkipNogs then
    UseSkip = SkipFirst
  End if
  
  LastX = SX
  
  For I = 0 To UBound(StudCenters)
    
      If (StudCenters(I) >= EX) then
        Exit For
      End If   
      
      If StudCenters(I) > SX then
        If not UseSkip then  
          if SkipNogs then
            aHeight = Height  
          elseif NogUp then
            aHeight = Height + (CAD.PlateElevationWidth/2) + NogOffset
          Else
            aHeight = Height - (CAD.PlateElevationWidth/2) - NogOffset
          End If
          
          if ((StudCenters(I) - LastX) > (CAD.StudElevationWidth * 2.5)) then
            if (LastX = SX) Then ' very first nog segment, start offset is start of frame
              CAD.PlaceFrameObject fotNog, LastX + CAD.EndClearance & "," & aHeight, StudCenters(I) + (CAD.StudElevationWidth/2 - CAD.EndClearance) & "," & aHeight, NOT_FLIPPED, stPlate
            else ' most other nog segments, start half stud with before offset
              CAD.PlaceFrameObject fotNog, LastX - (CAD.StudElevationWidth/2 - CAD.EndClearance) & "," & aHeight, StudCenters(I) + (CAD.StudElevationWidth/2 - CAD.EndClearance) & "," & aHeight, NOT_FLIPPED, stPlate
            end if
          end if
        End If
        
        LastX = StudCenters(I)
        NogUp = not NogUp
        if SkipNogs then
          UseSkip = not UseSkip
        end if 
      End If 
    Next
       
    ' If lastx = sx then there are no studs between passed sx and ex so just
    '   place nog on original nog line, otherwise if the lastx used isnt equal to 
    '   ex then place a final nog 
    
    if (LastX = SX) and ((EX - SX) > (CAD.StudElevationWidth * 2.5)) then
      CAD.PlaceFrameObject fotNog, SX - (CAD.StudElevationWidth/2 - CAD.EndClearance) & "," & Height, EX + (CAD.StudElevationWidth/2 - CAD.EndClearance) & "," & Height , NOT_FLIPPED, stPlate
    elseif (LastX <> EX) and (not UseSkip) then
    
      if SkipNogs then
        aHeight = Height
      elseif NogUp then
        aHeight = Height + (CAD.PlateElevationWidth/2) + NogOffset
      else
        aHeight = Height - (CAD.PlateElevationWidth/2) - NogOffset
      end if
        
      if ((EX - LastX) > (CAD.StudElevationWidth * 2.5)) then
        CAD.PlaceFrameObject fotNog, LastX - (CAD.StudElevationWidth/2 - CAD.EndClearance) & "," & aHeight, EX - CAD.EndClearance & "," & aHeight, NOT_FLIPPED, stPlate
      end if
    end if
    CAD.AutoExtend = True
End Sub

Sub PlaceDiscontinousNogs(Height,StudCenters,NogOffset,SkipNogs,SkipFirst)
    Dim Dist, I, F
    With CAD
        
        If Features.Count = 0 Then
            SplitNog 0,Builder.Length,Height,StudCenters,NogOffset,SkipNogs,SkipFirst
        Else
            Dist = 0
            nogstart = 0
            nogend = 0
            
            For I = 0 To Features.Count - 1
                Set F = GetNextLeftFeature(Dist)
                If OK Then
                    dist = F.FOffset + F.FWidth
                    
                    Select Case F.GetType
                        Case "Window", "Door"
                            If Not (F.NogPassThrough(Height, NogOffset + CAD.PlateElevationWidth) = True) Then nogend = F.FOffset
                        Case Else
                            'Let the nog go through
                    End Select
                    
                    If nogend > nogstart Then
                        If nogend > nogstart + 100 Then
                            SplitNog nogstart,nogend,Height,StudCenters,NogOffset,SkipNogs,SkipFirst
                        End If
                        nogstart = F.FOffset + F.FWidth
                    End If
                    
                    If F.FOffset > Dist + 100 Then
                        SplitNog Dist,F.FOffset,Height,StudCenters,NogOffset,SkipNogs,SkipFirst
                    End If
                    Dist = F.FOffset + F.FWidth
                End If
            Next
            If nogstart + 100 < Builder.Length Then
                SplitNog nogstart,Builder.Length,Height,StudCenters,NogOffset,SkipNogs,SkipFirst
            End If
        End If
        
    End With
End Sub
