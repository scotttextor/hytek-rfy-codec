'[FCAD2000-0]
'[TRUSS]
'[JOIST]

'******************************************************************************
'
'   Raked Parallel truss script
'
'   13 May 2008   N.Penny     Created (Based on Parallel truss code)
'   10 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
'   10 Sep 2010   J.burns     Fixed the far end corners on angles > 15 deg
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"
Include "SiteInfo.incx"
Include "DivideSpace.incx"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

  Public Span
  Public StartHeight
  Public UsePlumbHeight
  Public Angle
  Public Breaks
  Public Maximum_Web_Spacing
  Public Auto_Dimension

  Private Length, PlumbHeight, Xaxis, BCAxis, TCAxis, Js1Axis, Js2Axis, BCAxis_T, SL, BC, TC, Offset, MinFirstBreak
  
  Public Sub Build
    Dim A, TopLine, BottomLine, MaxHeight, BottomSpan, WebSpan
    Dim Y1, Y2, I, Count
    Dim NumDoubleWebs, DoubleWebSpace, doublewebgap

    With CAD
      if UsePlumbHeight then
        PlumbHeight = StartHeight
      else
        PlumbHeight = StartHeight / Cos(Angle * Pi / 180)
      end if

      'Place bottom chord and left hand top chord
      BottomSpan = Span / Cos(Angle * Pi / 180)
      SL = .PlaceLine("0,0", "@" & StartHeight * 1.5 & "<" & 90 + Angle)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & BottomSpan * 1.2 & "<" & Angle, FLIPPED, stPlate)
      .ClipRef = drLEFT
      TC = .PlaceFrameObject(fotTopChord, "0," & PlumbHeight, "@" & BottomSpan * 1.2  & "<" & Angle, NOT_FLIPPED, stPlate)
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      TCAxis = .PlaceStickAxis(TC, .PlateAxisDist)
      MinFirstBreak = .StudElevationWidth * 1.5
      .AutoExtend = True

      MaxHeight = Max(PlumbHeight, Tan(Angle * Pi / 180) * Span + PlumbHeight)

      'Place jack studs
      .ClipRef = drLEFT
      A = .PlaceFrameObject(fotWeb, "0,0", "@" & PlumbHeight & "<90", NOT_FLIPPED, stStud)
      .ExtendToFurthest A, TC
      Js1Axis = .PlaceStickAxis(A, .StudAxisDist)

      .ClipRef = drRIGHT
      A = .PlaceFrameObject(fotWeb, Span & ",0", "@" & MaxHeight + 100 & "<90", FLIPPED, stStud)
      .ExtendCode = ecStart
      .ExtendToFurthest A, BC
      .ExtendCode = ecEnd
      .ExtendToFurthest A, TC
      Js2Axis = .PlaceStickAxis(A, .StudAxisDist)

      'Fix up the far end corners
      .ExtendToFurthest TC, A
      .ExtendToFurthest BC, A

      'Place a more realistic SL
      Xaxis = .PlaceLine("-1000,0","1000,0")
      BCAxis_T = .PlaceLine(.Intersection(BCAxis, Js1Axis), "@1000<" & Angle - 90)
      SL = .PlaceLine(.Intersection(BCAxis_T,XAxis), "@" & PlumbHeight * 2 & "<" & 90 + Angle)
      BottomSpan = .Distance(.Intersection(BCAxis, Js1Axis), .Intersection(BCAxis, Js2Axis))

      SortBreaks

      .ClipRef = drMID

      If UBound(Breaks) >= 0  Then
        For I = 0 To UBound(Breaks)
          If ( Breaks(I) > MinFirstBreak ) Then
            A = .PlaceFrameObject(fotWeb, Breaks(I) & ",0", "@" & PlumbHeight & "<90", NOT_FLIPPED, stStud)
            .ExtendCode = ecEnd
            .ExtendToFurthest A, TC
            .ExtendCode = ecStart
            .ExtendToFurthest A, BC
          End If
        Next
      End If
      
      Offset = 0
      If UBound(Breaks) < 0 Then
        PlaceWebs BottomSpan
      ElseIf Breaks(0) = 0 and UBound(Breaks) = 0 Then
        PlaceWebs BottomSpan
      Else
        For I = 0 To UBound(Breaks)
          PlaceWebs (Breaks(I) - .StudAxisDist)
          Offset = Breaks(I)
        Next
        Offset = (Breaks(UBound(Breaks)) - .StudAxisDist)
        PlaceWebs BottomSpan
      End If

      'Clean up mess
      .EraseConstructionLines
    End With

    If Auto_Dimension = True Then DimensionFrame
  End Sub

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    Dim iDimensionCount_Bottom
    Dim MinHeight
    iDimensionCount_Bottom = 0
    minHeight = Tan(Angle * Pi / 180) * Span

    CAD.PlaceDimension "0," & MinHeight, Span & "," & MinHeight, "0," & MinHeight - iDimensionFirstSpace, 1, -2, iDimensionFontSize, "H"
    if UsePlumbHeight then
      CAD.PlaceDimension "0," & PlumbHeight, "0,0", -iDimensionFirstSpace & ",0", 1, -2, iDimensionFontSize, "V"
    else
      CAD.PlaceDimension "0,0", "@" & StartHeight & "<" & 90 + Angle, Cos(Angle * Pi / 180) * -iDimensionFirstSpace & "," & Sin(Angle * Pi / 180) * -iDimensionFirstSpace, 1, -2, iDimensionFontSize, "A"
    end if
    iDimensionCount_Bottom = iDimensionCount_Bottom + 1
    
    For I = 0 To UBound(Breaks)
      If ( Breaks(I) > MinFirstBreak ) Then 
        CAD.PlaceDimension "0," & MinHeight, Breaks(I) & "," & MinHeight, "0," & MinHeight - iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom), 1, -2, iDimensionFontSize, "H"
      End If
      iDimensionCount_Bottom = iDimensionCount_Bottom + 1
    Next
  End Sub

  Private Function PlaceWebs(BottomSpan)
    Dim A, X1, X2, CL, NumWebs, WebIndex, WebSpacing
    With CAD
      .ClipRef = drDimple
      .CopyMode = True    
      CL = .Offset(SL, (BottomSpan - Offset) / 2 + Offset)
      WebSpacing = ((BottomSpan - Offset) / 2) - .StudElevationWidth
      NumWebs = DivideSpace(WebSpacing, Maximum_Web_Spacing / 2)
      X1 = .Offset(SL, .StudElevationWidth + Offset)
      X2 = .Offset(SL, WebSpacing + .StudElevationWidth + Offset)
      If NumWebs > 0 and WebSpacing > .StudElevationWidth Then
        For WebIndex = 1 To NumWebs
          Y1 = .Offset(X1, .Web2Web / 2)
          Y2 = .Offset(X2, - .Web2Web / 2)
          If WebIndex Mod 2 = 0 Then
            A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, Y2), .Intersection(TCAxis, Y1), FLIPPED, stStud)
          Else
            A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, Y1), .Intersection(TCAxis, Y2), NOT_FLIPPED, stStud)
          End If
          .ExtendCode = ecStart
          .ExtendToFurthest A, BC
          .ExtendCode = ecEnd
          .ExtendToFurthest A, TC
          .Mirror A, CL

          X1 = .Offset(X1, WebSpacing)
          X2 = .Offset(X2, WebSpacing)
        Next
        If (Atn(StartHeight / (Webspacing - .Web2Web)) * 180 / Pi) > 70 Then 
          MsgBox("Web Angle may be too steep.  Consider increasing the value of Maximum_Web_Spacing")
        End If
      End If
    End With
  End Function

  Private Sub SortBreaks
    Dim V,I,O   

    tRefs = Breaks
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
      Breaks = tRefs
    Else
      tRefs = Array(0.0)
    End If      
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Public Function PickArray
    Dim Result

    Result = CAD.PickFrameReference("Pick a Break Point")
    If Not IsEmpty(Result) Then
      PickArray = Result
    Else
      PickArray = 0
    End If
  End Function

  Private Sub Class_Initialize()
    Span = CAD.FrameLength("")
    StartHeight = 300.0
    UsePlumbHeight = True
    Angle = 3.0
    Breaks = Array(0.0)
    Maximum_Web_Spacing = 600.0
    Auto_Dimension = True
    Inverted = False
  End Sub

End Class

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
