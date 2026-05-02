'******************************************************************************
'
'  SiteInfo.inc
'
'  File to contain site specific information, to keep user definable
'  options in FRAMECAD Scripts to a minimum
'
'  Created - 12 Feb 2006 - Nathan Penny (np@metalformingtech.com)
'
'******************************************************************************

'  Opening base Type
'   0 for Continuous Bottom Chord with Notches at door sides
'   1 for No Bottom Chord in Openings with Temporary Brace
Const OpeningBaseType = 0

'  Elevation for Temporary Brace when OpeningBaseType = 1
Const OpeningTempBrace = 100

'  Angled Wall Top Plate to Stud Clearance
Const StudEndClearance = 4

'  Distance to keep webs inside chords on Parallel Trusses
Const TrimWebInside = 0 ' Set to 0 to use autoextend, or value to use that
