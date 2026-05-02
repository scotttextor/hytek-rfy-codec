'******************************************************************************
'
'  libTruss.inc
'
'  Include file for Trusses
'
'  Created - 22 Dec 2010
'
'  Author - John Burns (johnb@framecad.com)
'
'******************************************************************************

Public Function getTyeOffset(dPitch,dProfileWidth)
  'Calculates the Offset for a Tye
  Dim dMinOffset,dCalculatedOffset

  dMinOffset = dProfileWidth * Sqrt2
  dCalculatedOffset =  Tan(dPitch * Pi / 180) * (2 * dProfileWidth)
  
  If dMinOffset > dCalculatedOffset Then
    getTyeOffset = dMinOffset
  Else
    getTyeOffset = dCalculatedOffset
  End If
End Function