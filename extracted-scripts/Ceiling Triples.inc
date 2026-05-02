'******************************************************************************
'
'  Triples.inc
'
'  Include file for creating triple stud features in walls
'
'  Created - 27th Feb 2001
'  Modified - 21 Sep 2004 by John Burns
'  Questions? jb@metalformingtech.com
'
'******************************************************************************


Class TTriple

  Public Offset, Width, Dimension_To_Centre
  Public AllowNogPassthrough
  Public PickWidth
  Private Result, AtEnd, AtFarEnd

  Public Function FOffset
    FOffset = Offset
  End Function

  Public Function Auto_Dimension
    Return False
  End Function

  Public Function FWidth
    FWidth = Width
  End Function

  Public Sub Build
    Dim F

    With CAD
      AtEnd = FOffset <= FWidth
      AtFarEnd = FOffset + FWidth >= Builder.Length - 1

      If AtEnd Then
        .ClipRef = drLEFT
        F = .PlaceFrameObject(fotStud, FOffset & ",0" , "@" & Builder.Height & "<90", NOT_FLIPPED, stStud)
      Else
        .ClipRef = drRIGHT
        F = .PlaceFrameObject(fotStud, FOffset & ",0" , "@" & Builder.Height & "<90", FLIPPED, stStud)
      End If

      .ExtendCode = EcEnd
      .ExtendToFurthest F, TopPlate

      If AtFarEnd Then
        .ClipRef = drRIGHT
        F = .PlaceFrameObject(fotStud, FOffset + FWidth & ",0" , "@" & Builder.Height & "<90", FLIPPED, stStud)
        'Extend the top plate to the stud
        .ExtendCode = EcEnd
        .ExtendToFurthest TopPlate, F
      Else
        .ClipRef = drLEFT
        F = .PlaceFrameObject(fotStud, FOffset + FWidth & ",0" , "@" & Builder.Height & "<90", NOT_FLIPPED, stStud)
      End If

      .ExtendCode = EcEnd
      .ExtendToFurthest F, TopPlate

    End With
  End Sub

  Public Sub DimensionThisFeature(iHorizontalDimensionCount, iVerticalDimensionCount, bDimensionInternally)
    bottomoffset = -iDimensionFirstSpace + (-iHorizontalDimensionCount * iDimensionSpacing)
    iHorizontalDimensionCount = iHorizontalDimensionCount + 1

    If Not Dimension_To_Centre Then
      'Dimension the Width of the triple
      CAD.PlaceDimension cStr(Offset) & ",0", cStr(Offset + Width) & ",0", cStr((Offset + Width)/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"

      'Dimension the Offset when it's greater than 0
      If Offset > 0 Then
        CAD.PlaceDimension "0,0", cStr(Offset) & ",0", cStr(Offset/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
      End If
    Else
      CAD.PlaceDimension "0,0", cStr(Offset + (Width/2)) & ",0", cStr((Offset + (Width/2))/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
    End If
  End Sub

  Public Function Extents
    With CAD
      If AtEnd Then
        Extents = Array(Builder.Height, 0, 0, FWidth + .StudElevationWidth)
      ElseIf AtFarEnd Then
        Extents = Array(Builder.Height, FOffset - .StudElevationWidth, 0, Builder.Length)
      Else
        Extents = Array(Builder.Height, FOffset - .StudElevationWidth, 0, FOffset + FWidth + .StudElevationWidth)
      End If
    End With
  End Function

  Public Function NogPassThrough(Height, Distance)
    NogPassThrough = AllowNogPassthrough AND True
  End Function

  Public Function GetType
    GetType = "Triples"
  End Function

  Public Sub Pick
    If PickWidth = False Then
      Result = CAD.PickFrameReference("Pick Triple Offset (Set Width Before Picking)")
      If Not IsEmpty(Result) Then
        Offset = Result
      Else
        Offset = 0
      End If
    Else
      Result = CAD.PickOffsetWidth("Pick Offset then Width")
      If Not IsEmpty(Result) Then
        Offset = Result(0)
        Width = Result(1)
      End If
    End If
  End Sub

  Private Sub Class_Initialize()
    Offset = 0.0
    Width = 100.0
    Dimension_To_Centre = False
    AllowNogPassthrough = True
    PickWidth = True
  End Sub

End Class
