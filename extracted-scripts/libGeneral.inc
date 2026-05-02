Public Function Dimension_Offset(iDimensionLocation)
  'Returns the spacing (in Dimension Spaces) for the given dimension (Left, Right, Top, Bottom)
  Dim iTemp
  Select Case iDimensionLocation
    Case locationTOP, locationRight
      Dimension_Offset = 0
    Case locationBOTTOM, locationLeft
      Dimension_Offset = 0
    
      'Check for Profile Shape
      If CAD.DrawElevationProfiles Then
        iTemp = iTemp + CAD.PlanWidth + 20

        'Check for stud dimenstioning
        iTemp = iTemp + iDimensionStickLineLength
        iTemp = iTemp + iDimensionStickFontSize
        Dimension_Offset = cInt(iTemp / iDimensionSpacing)
        If Round(iTemp / iDimensionSpacing) > Dimension_Offset Then
          Dimension_Offset = Dimension_Offset + 1
        End If
      End If
  End Select
End Function