'******************************************************************************
'
'  Constants.inc
'
'   Include file for common constants
'
'   27 Feb 2001                 Created
'   25 Aug 2010     J.Burns     Added constants for Dimensioning
'   14 Oct 2010     J.Burns     Added Frame Orientations
'   22 Oct 2010     J.Burns     Added Jack and Jam Stud values (openings)
'   16 Aug 2011   J.Burns     Added Stud Dimensioning constants
'  19 Mar 2012    G.Aiken    Addes Stick Type constants
'
'******************************************************************************

' Stick end snap values
Const drMID = 0
Const drLEFT = 1
Const drRIGHT = 2
Const drDIMPLE = 4

'Mathematical Constants
Const Pi = 3.1415926535897932
Const Sqrt2 = 1.4142

'  Extend codes
Const ecNull = 0
Const ecStart = 1
Const ecEnd = 2

'  Web Layout Codes
Const wlFramecad = 0
Const wlFink = 1
Const wlPratt = 1
Const wlHowe = 2
Const wlFan = 3

'X Axis Position Codes
Const posX_None = 0
Const posX_Web = 1
Const posX_Lip = 2
Const posX_Center = 3 
Const posX_Left = 4
Const posX_Right = 5

'Dimension sizes
Const iDimensionFirstSpace = 300        'Space in mm from frame for the first dimension
Const iDimensionSpacing = 200           'Space in mm between dimensions
Const iDimensionInternalSpacing = 200   'Space in mm for dimensioning inside openings
Const iDimensionFontSize = 80
      iDimensionStickFontSize = 50      'Font height in mm for dimensioning the position of sticks
Const iDimensionStickLineLength = 40    'Length in mm of line for dimensioning the position of sticks

'Dimension Locations
Const locationTOP = 0
Const locationBOTTOM = 1
Const locationLEFT = 2
Const locationRIGHT = 3

'Frame Orientations
Const iOrientationOnFlat = 0
Const iOrientationOnEdge = 1
Const iOrientationBackToBack = 2

'Clearances 
Const iBackToBackSpacing = 2            'Space in mm between Studs
Const iOpeningJamStudClearance = 2      'Space in mm between Jam Studs and Extra jam Studs in openings

'Stick Types
Const fotUnknown = "suUnknown"
Const fotTopPlate = "suTopPlate"
Const fotBottomPlate = "suBottomPlate"
Const fotHeadPlate = "suHeadPlate"
Const fotSill = "suSill"
Const fotNog = "suNog"
Const fotTopChord = "suTopChord"
Const fotBottomChord = "suBottomChord"
Const fotTye = "suTye"
Const fotBrace = "suBrace"
Const fotWeb = "suWeb"
Const fotStud = "suStud"
Const fotTrimStud = "suTrimStud"
Const fotJackStud = "suJackStud"

'Section type
Const stPLATE = 0
Const stSTUD = 1

Const NOT_FLIPPED = 0
Const FLIPPED = 1
