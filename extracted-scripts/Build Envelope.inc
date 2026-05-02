'******************************************************************************
'
'   Build Envelope.inc
'
'   Places sticks around the envelope of a frame
'
'   27 Feb 2001               Created
'   11 Oct 2010   J.Burns     Fixed issue with Edge array indexes
'
'******************************************************************************

Public Sub BuildEnvelope(TM)
  Dim I, EnvHorizVertices, EnvFHorizVertices, EnvVertVertices, EnvFVertVertices, EdgeCount 
  With CAD
    EnvHorizVertices = TM.Horizontals
    EnvVertVertices = TM.Verticals
    EnvFVertVertices = TM.FlippedVerticals
    EnvFHorizVertices = TM.FlippedHorizontals

    EdgeCount = 0

    If UBound(EnvHorizVertices,1) > -1 Then
      EdgeCount = EdgeCount + UBound(EnvHorizVertices,1) + 1
    End If
    If UBound(EnvVertVertices,1) > -1 Then
      EdgeCount = EdgeCount + UBound(EnvVertVertices,1) + 1
    End If
    If UBound(EnvFVertVertices,1) > -1 Then
      EdgeCount = EdgeCount + UBound(EnvFVertVertices,1) + 1
    End If
    If UBound(EnvFHorizVertices,1) > -1 Then
      EdgeCount = EdgeCount + UBound(EnvFHorizVertices,1) + 1
    End If

   'If there are less than 3 edges found, couldnt have possibly made a closed polygon  
    If EdgeCount < 3 Then
      MsgBox "Ensure envelope and opening polygons have been drawn in elevation view and rebuild"
    Else
      .ClipRef = drLEFT
      For I = 0 To UBound(EnvHorizVertices,1)
        .PlaceFrameObject fotTopPlate, EnvHorizVertices(I,0),EnvHorizVertices(I,1), NOT_FLIPPED, stPlate
      Next
      For I = 0 To UBound(EnvVertVertices,1)
        .PlaceFrameObject fotStud, EnvVertVertices(I,0),EnvVertVertices(I,1), NOT_FLIPPED, stStud
      Next

      .ClipRef = drRIGHT
      For I = 0 To UBound(EnvFHorizVertices,1)
        .PlaceFrameObject fotBottomPlate, EnvFHorizVertices(I,0),EnvFHorizVertices(I,1), FLIPPED, stPlate
      Next
      For I = 0 To UBound(EnvFVertVertices,1)
        .PlaceFrameObject fotStud, EnvFVertVertices(I,0),EnvFVertVertices(I,1), FLIPPED, stStud
      Next
    End If
  End With
End Sub