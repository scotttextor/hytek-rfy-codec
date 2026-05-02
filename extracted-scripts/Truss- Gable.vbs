'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Full truss script
'
'   11th December 2003
'
'   16th December 2003
'
'******************************************************************************
option explicit

Include "Constants.inc"
Include "ConvertPitch.incx"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

  Public Pitch
  Public Left_Eave
  Public Right_Eave
  Public Top_Chord_Drop
  Public Height_At_Wall
  Public Max_Web_Spacing
  Public Place_Tye
  Public Auto_Dimension
  Public Structural_webs

  Private Length
  Private MetricPitch
  Private dimensionoffset
  Private framedimensiony2
  Private BCAxis, LCAxis, RCAxis, TyeAxis, Web2Stud, Peak, CL
  Private NumWebs, WebIndex, WebSpacing, LeftEaveDrawn, RightEaveDrawn
  
  Function TrussHeight
    TrussHeight = Height_At_Wall - (Top_Chord_Drop / cos(MetricPitch * PI / 180 ))
  End Function

  Function posmove
    if TrussHeight <= CAD.StudElevationWidth OR TrussHeight > (CAD.StudElevationWidth / cos(MetricPitch * PI / 180)) * 2 then
        posmove = 0
    else
        posmove = Top_Chord_Drop / sin(MetricPitch * PI / 180)
    end if
  End Function

  Public Property Get Span
    Span = Length - Left_Eave - Right_Eave
  End Property

  Public Sub Build
    Dim A, B, Z, BC, LC, RC, Tye
    Dim X1, X2, L
    Dim NextPunch, WebLayout, iFrameStart
    
    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    With CAD
      '  Place bottom chord and left hand top chord
      .AutoExtend = False
      Peak = Tan(MetricPitch * Pi / 180) * (Span / 2) + TrussHeight
      CL = .PlaceLine(Span / 2 & ",0", "@" & Peak + 200 & "<90")
      Web2Stud = .Web2Web / 2 + .StudElevationWidth / 2
      iFrameStart = Height_At_Wall / (tan((MetricPitch*Pi)/180))
      LeftEaveDrawn = False
      A = .PlaceLine(PosMove & "," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0," & TrussHeight, "@" & Span / 2 & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A

      'Place top right chord
      RC = .PlaceFrameObject(fotTopChord,Span/2 + 0 & "," & Peak,Span & "," & TrussHeight, NOT_FLIPPED, stPlate)
      .Extend RC, A
      
      .AutoExtend = True
      'Extend top chords to eaves
      .CopyMode = True
      .ExtendCode = ecNull
      if TrussHeight <= .StudElevationWidth then
        .ExtendToFurthest BC, RC
        .ExtendToFurthest BC, LC
        .ExtendToFurthest RC, BC
        .ExtendToFurthest LC, BC
      elseif TrussHeight > (.StudElevationWidth / cos(MetricPitch * PI / 180)) * 2 then
        ' place studs at start/end of frame
        .ClipRef = drLEFT
        A = .PlaceFrameObject(fotWeb, "0,0", "@" & TrussHeight & "<90", NOT_FLIPPED, stStud)
        .ExtendToFurthest A, LC
        ' extend bottom chord to stud
        .ExtendToFurthest BC, A
        B = .Mirror(A, CL)
        .ExtendToFurthest BC, B
        if Left_Eave > 0 then
          A = .PlaceLine( - Left_Eave & ",-500" , "@1500<90")
          .Extend LC, A
          LeftEaveDrawn = True
        else
          .ExtendToFurthest LC, A
        end if
        if Right_Eave > 0 then
          B = .PlaceLine(Span + Right_Eave & ",-500" , "@1500<90")
          .Extend RC, B
          RightEaveDrawn = True
        else
          .ExtendToFurthest RC, B
        end if
      else
        ' place studs at start/end of frame
        .ClipRef = drLEFT
        A = .PlaceFrameObject(fotWeb, posmove & ",0", "@" & TrussHeight & "<90", NOT_FLIPPED, stStud)
        .ExtendToFurthest A, LC
        ' extend bottom chord to stud
        .ExtendToFurthest BC, A
        B = .Mirror(A, CL)
        .ExtendToFurthest BC, B
        if Left_Eave > 0 then
          A = .PlaceLine( - Left_Eave & ",-500" , "@1500<90")
          .Extend LC, A
          LeftEaveDrawn = True
        else
          .ExtendToFurthest LC, A
        end if
        if Right_Eave > 0 then
          B = .PlaceLine(Span + Right_Eave & ",-500" , "@1500<90")
          .Extend RC, B
          RightEaveDrawn = True
        else
          .ExtendToFurthest RC, B
        end if
      end if
            
      ' Create Chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)
      .Extend BCAxis, LCAxis
      RCAxis = .PlaceStickAxis(RC, .PlateAxisDist)
      .Extend BCAxis, RCAxis

      '  Place Tye
      .AutoExtend = True

      If Place_Tye Then
        .ClipRef = drLEFT
        Tye = .PlaceFrameObject(fotTye, Span / 2 - 200 & "," & Peak - .Web2Web , "@300<0", NOT_FLIPPED, stPlate)
        .ExtendCode = ecStart
        .ExtendToFurthest Tye, LC
        .ExtendCode = ecEnd
        .ExtendToFurthest Tye, RC
        TyeAxis = .PlaceStickAxis(Tye, .PlateAxisDist)
        .ExtendCode = ecNull
      End If

      ' Place Webs
      .AutoExtend = True
      .ClipRef = drMid
      .CopyMode = True
      
      If Span / 2 < Max_Web_Spacing Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
      ElseIf Span /2 < Max_Web_Spacing * 1.5 Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        X2 = .Offset(X1, -(Span/4))
        If Structural_webs Then
	  .ClipRef = drDIMPLE
	  A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
	End If
        .Mirror A, CL
      Else
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        X2 = .Offset(X1, -Max_Web_Spacing)
        If Structural_webs Then 
	  .ClipRef = drDIMPLE
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
        End If
        X1 = .Offset(X2, -Web2Stud)
	.ClipRef = drMID
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
       .Mirror A, CL
        L = Span / 2 - (Max_Web_Spacing + (Web2Stud * 2))

        Do While (L > Max_Web_Spacing + iFrameStart + (2 * Web2Stud) + .Web2Web)
          X1 = .Offset(X1, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))

          If Structural_webs Then 
            If IsNull(.Intersection(BCAxis, X1)) or IsNull(.Intersection(LCAxis, X2)) then
              Exit Do
            End If
            .ClipRef = drDIMPLE 
            A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
            .Mirror A, CL
          End If
          X1 = .Offset(X2, -Web2Stud)
          
          If IsNull(.Intersection(BCAxis, X1)) or IsNull(.Intersection(LCAxis, X1)) then
            Exit Do
          End If
          .ClipRef = drMID
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          .ExtendToFurthest A, BC
          .Mirror A, CL
          L = L - Max_Web_Spacing
        Loop
      End If           

      '  Clean up mess & adjust for 3D viewing
      .EraseConstructionLines

      'Translate for 3d drawing
      .Translate Left_Eave, 0

    End With
    If Auto_Dimension = True Then dimensionframe
  End Sub ' End Public Sub Build

  Public Sub dimensionframe
    Dim trussdimstart, trussdimend, textpitch
    
    With CAD
      trussdimstart = 0
      trussdimend = Length
        
      ' Dimension Start Height
      .PlaceDimension "0,0", "@" & Height_At_Wall & "<90", -iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"

      ' Dimension Overall Height
      .PlaceDimension "0,0", "@" & Peak & "<90", -(iDimensionFirstSpace + iDimensionSpacing) & ",0",1,-2,iDimensionFontSize,"V"

      ' Dimension Bottom Chord
      if LeftEaveDrawn = True Then
        .PlaceDimension "0,0", "@" & trussdimstart + Left_Eave & "<0", "0," & -iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
        trussdimstart = trussdimstart + Left_Eave
      end if
      
      if RightEaveDrawn = True Then
        .PlaceDimension trussdimend - Right_Eave & ",0", "@" & Right_Eave & "<0", "0," & -iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
        trussdimend = trussdimend - Right_Eave
      end if
      
      if posmove > 0 then
        .PlaceDimension trussdimstart & ",0 ", "@" & posmove & "<0", "0," & -iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
        .PlaceDimension trussdimend - posmove & ",0 ", "@" & posmove & "<0", "0," & -iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
        trussdimstart = trussdimstart + posmove
        trussdimend = trussdimend - posmove
      end if
      
      .PlaceDimension trussdimstart & ",0", trussdimend & ",0", "0," & -iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
      
      If InStr(Pitch, ":") >0 Then textpitch = "Pitch=" & Pitch Else textpitch = "Pitch=" & Pitch & Chr(176)
      CAD.PlaceLabel TextPitch , 0 & "," & Peak + iDimensionFontSize, iDimensionFontSize, 0
    End With
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    Top_Chord_Drop = 89.0
    Pitch = "20"
    Left_Eave = 0.0
    Right_Eave = 0.0
    Height_At_Wall = 100.0
    Max_Web_Spacing = 600.0
    Place_Tye = True
    Auto_Dimension = True
    Structural_webs = True
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

'******************************************************************************
'  Include
'
'  Includes external source files
'
'******************************************************************************

Sub Include(File)
  Dim fso, f, Str

  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.OpenTextFile(File, 1)
  Str = f.ReadAll
  f.Close
  ExecuteGlobal Str
End Sub
