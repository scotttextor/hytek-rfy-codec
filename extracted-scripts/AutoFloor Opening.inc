Option Explicit
'******************************************************************************
'
'  AutoFloor Opening.inc
'
'  Include file for basic wall openings (doors, windows)
'
'  Created - 27th Feb 2001
'
'******************************************************************************

'******************************************************************************
'   Opening class
'******************************************************************************

'******************************************************************************
'   Opening class
'******************************************************************************

Class TOpening

Public Head
Public Offset
Public Width
Public Sill
Public Clearance
Public Header_Type
Public Trimmer_Type
Public Centered

Private Result
Private LTop
Private LTopDist
Private LBot
Private LBotDist
Private RTop
Private RTopDist
Private RBot
Private RBotDist
Private LJackTop
Private LJackTopDist
Private RJackTop
Private RJackTopDist
Private MidSillBot
Private MidSillBotDist
Private LStudX
Private RStudX
Private LJStudX
Private RJStudX
Private OpeningMidY
Private OpeningMidX

    Public Function FOffset
        FOffset = Offset - Clearance
    End Function
    
    Public Function FWidth
        FWidth = Width + (2 * Clearance)
    End Function
    
    Public Function FSill
      Header_Type = CAD.GetListIndex (Me, "Header_Type")      

         If Header_Type = 0 Then ' Single
          FSill = Sill
        ElseIf Header_Type = 1 Then ' Boxed
          FSill = Sill - CAD.PlateElevationWidth
        Else ' Boxed plus Single
          FSill = Sill - CAD.PlateElevationWidth
'          If Sill > .PlateElevationWidth * 3 Then
'             FSill = Sill - CAD.PlateElevationWidth
'           End If
    End If
    End Function
    
    Public Function TotalHead
      Header_Type = CAD.GetListIndex (Me, "Header_Type")      
          
         If Header_Type = 0 Then ' Single
           TotalHead = Head
         ElseIf Header_Type = 1 Then ' Boxed
           TotalHead = Head + CAD.PlateElevationWidth
         Else ' Boxed plus Single
           TotalHead = Head + CAD.PlateElevationWidth
'           If LJackTopDist > .PlateElevationWidth * 3 AND RJackTopDist > .PlateElevationWidth * 3 Then
'            TotalHead = Head + CAD.PlateElevationWidth
'          End If
    End If
    End Function
    
    Private Sub SetConstants
      with CAD
          LStudX = FOffset - .StudElevationWidth/2
          RStudX = FOffset + FWidth + (.StudElevationWidth/2)
          LJStudX = LStudX + .StudElevationWidth + 1 
          RJStudX = RStudX - .StudElevationWidth - 1
          OpeningMidY = (Head - Sill)/2 + Sill
          OpeningMidX = Offset + Width/2
        end with
    End Sub
    
    Private Sub SetClippingSticks
        with CAD
          LTop = .ClosestStick(LStudX,OpeningMidY,90,LTopDist)
            if LTop = -1 then
              MsgBox "Script fault: Left top stick could not be found"
            end if 
            
            LBot = .ClosestStick(LStudX,OpeningMidY,270,LBotDist)
            if LBot = -1 then
              MsgBox "Script fault: Left bottom stick could not be found"
            end if 
            
               RTop = .ClosestStick(RStudX,OpeningMidY,90,RTopDist)
               if RTop = -1 then
              MsgBox "Script fault: Right top stick could not be found"
            end if 
            
               RBot = .ClosestStick(RStudX,OpeningMidY,270,RBotDist)
               if RBot = -1 then
              MsgBox "Script fault: Right bottom stick could not be found"
            end if 
            
               LJackTop = .ClosestStick(LJStudX,Head,90,LJackTopDist)
               if LJackTop = -1 then
              MsgBox "Script fault: Left jack top stick could not be found"
            end if 
            
               RJackTop = .ClosestStick(RJStudX,Head,90,RJackTopDist)
               if RJackTop = -1 then
              MsgBox "Script fault: Right jack top stick could not be found"
            end if 
            
            MidSillBot = .ClosestStick(OpeningMidX,Sill,270,MidSillBotDist)
            if MidSillBot = -1 then
              MsgBox "Script fault: Mid sill bottom stick could not be found"
            end if
            
          End with
    End Sub
    
    Public Function GetType
      GetType = "Openings"
    End Function

    Public Sub DimensionThisFeature(currentbottomdimensioncount, currentleftdimensioncount, drawinternal)
      'Adds dimensions to feature

      Dim bottomoffset : bottomoffset = -iDimensionFirstSpace + (-currentbottomdimensioncount * iDimensionSpacing)
      Dim leftoffset : leftoffset = -iDimensionFirstSpace + (-currentleftdimensioncount * iDimensionSpacing)

      If drawinternal = True Then
        'Draw the dimensions of the opening inside the opening
        CAD.PlaceDimension Offset & "," & Sill, Offset & "," & Head , Offset + iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"
        CAD.PlaceDimension Offset & ",0",Offset + Width & ",0", "0," & sill + iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
      Else
        'Draw the dimensions of the opening on the L.H side of the frame
        If checkleftdimension(Sill, Head) = False Then
          CAD.PlaceDimension Offset & "," & sill, Offset & "," & cStr(Head), cStr(leftoffset) & "," & cStr(-leftoffset - iDimensionSpacing), 1, -2, iDimensionFontSize, "V"      'verticle head height dims
          currentleftdimensioncount = currentleftdimensioncount + 1
        End If
        CAD.PlaceDimension offset & ",0", cStr(Offset+width) & ",0" , cStr(Offset+(width/2)) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
      End If

      CAD.PlaceDimension "0,0", cStr(Offset) & ",0", cStr(Offset/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
      currentbottomdimensioncount = currentbottomdimensioncount + 1

      If Sill> 0 And checkleftdimension(0, Sill) = False Then
        CAD.PlaceDimension "0,0" , "0," & cStr(sill), cStr(leftoffset) & "," & cStr(sill/2) , 1, -2, iDimensionFontSize, "V"
        If drawinternal = True Then currentleftdimensioncount = currentleftdimensioncount + 1
      End If
    End Sub
    
    Public Sub Build
    Dim LT, TPAxis, LTAxis, F, N, LeftJoist, RightJoist
    Dim ETop,ELeft,EBottom,ERight, Clearance, joistLength
    
        With CAD
          .AutoExtend = False
          .DrawingExtents ETop, ELeft, EBottom,ERight
          SetConstants
          SetClippingSticks
          
          .AutoExtend = True
             .ClipRef = drMID
             Trimmer_Type = .GetListIndex (Me, "Trimmer_Type")  
           
             'Place Left Opening stud
        If LTop > -1 and  LBot > -1 Then
            LeftJoist = .PlaceFrameObject(fotStud,LStudX & ","& OpeningMidY, "@" & 10 & "<90", FLIPPED, stStud)
               .ExtendCode = ecEnd
               .ExtendToWeb LeftJoist, LTop
               .ExtendCode = ecStart 
               .ExtendToWeb LeftJoist, LBot
               If Trimmer_Type = 1 Then
                 joistLength = .Length(LeftJoist)
                 .Reinforce LeftJoist, .PlateElevationWidth , joistLength - (.PlateElevationWidth * 2), 0
               End If
             End If
             
      'Place Right Opening stud
      If RTop > -1 and RBot > -1 Then
               RightJoist = .PlaceFrameObject(fotStud,RStudX & ","& OpeningMidY, "@" & 10 & "<90", NOT_FLIPPED, stStud)
               .ExtendCode = ecEnd
               .ExtendToWeb RightJoist, RTop
               .ExtendCode = ecStart 
               .ExtendToWeb RightJoist, RBot
               If Trimmer_Type = 1 Then
                 joistLength = .Length(RightJoist)
                 .Reinforce RightJoist, .PlateElevationWidth, joistLength - (.PlateElevationWidth * 2), 0
               End If
             End If          
          
          Clearance = .EndClearance
          .AutoExtend = False
          Header_Type = .GetListIndex (Me, "Header_Type")
          
          .ClipRef = drRIGHT
      If Header_Type = 0 AND LJackTopDist > .PlateElevationWidth AND RJackTopDist > .PlateElevationWidth Then ' Single
        LT = .PlaceFrameObject( fotHeadPlate, FOffset & "," & Head , FOffset+FWidth & "," & Head , FLIPPED, stPlate)
          ElseIf Header_Type = 1 AND LJackTopDist > .PlateElevationWidth AND RJackTopDist > .PlateElevationWidth Then ' Boxed
        LT = .PlaceFrameObject( fotHeadPlate, FOffset & "," & Head , FOffset+FWidth & "," & Head , FLIPPED, stPlate)
            .Box LT
          ElseIf Header_Type = 2 AND LJackTopDist > .PlateElevationWidth AND RJackTopDist > .PlateElevationWidth Then ' Boxed plus Single
            LT = .PlaceFrameObject( fotHeadPlate, FOffset & "," & Head , FOffset+FWidth & "," & Head , FLIPPED, stPlate)
            .Box(LT)
            If LJackTopDist > .PlateElevationWidth * 3 AND RJackTopDist > .PlateElevationWidth * 3 Then
              LtSingle = .PlaceFrameObject(fotHeadPlate, FOffset & "," & Head+.PlateElevationWidth+Clearance, FOffset+FWidth & "," & Head+.PlateElevationWidth+Clearance, FLIPPED, stPlate)
              .ExtendCode = ecStart
                 .ExtendToWebEx LtSingle, LeftJoist, - Clearance
                 .ExtendCode = ecEnd
                 .ExtendToWebEx LtSingle, RightJoist, - Clearance
            End If
      End If
      
      If Lt > 0 Then
        .ExtendCode = ecStart
        .ExtendToWebEx LT, LeftJoist, - Clearance
        .ExtendCode = ecEnd
        .ExtendToWebEx LT, RightJoist, - Clearance
      End If
                     
           .ClipRef = drLEFT
      If Header_Type = 0 AND MidSillBotDist > .PlateElevationWidth Then ' Single
        LT = .PlaceFrameObject( fotHeadPlate, FOffset & "," & Sill ,FOffset+FWidth & "," & Sill , NOT_FLIPPED, stPlate)
            ElseIf Header_Type = 1 AND MidSillBotDist > .PlateElevationWidth Then ' Boxed
              LT = .PlaceFrameObject( fotHeadPlate, FOffset & "," & Sill ,FOffset+FWidth & "," & Sill , NOT_FLIPPED, stPlate)
        .Box LT
      ElseIf Header_Type = 2 AND MidSillBotDist > .PlateElevationWidth Then ' Boxed plus Single
        LT = .PlaceFrameObject( fotHeadPlate, FOffset & "," & Sill ,FOffset+FWidth & "," & Sill , NOT_FLIPPED, stPlate)
        .Box(LT)
        If Sill > .PlateElevationWidth * 3 Then
          Dim LtSingle
          LtSingle = .PlaceFrameObject(fotHeadPlate, FOffset & "," & Sill-.PlateElevationWidth-Clearance ,FOffset+FWidth & "," & Sill-.PlateElevationWidth-Clearance, NOT_FLIPPED, stPlate)
          .ExtendCode = ecStart
          .ExtendToWebEx LtSingle, LeftJoist, - Clearance
          .ExtendCode = ecEnd
                 .ExtendToWebEx LtSingle, RightJoist, - Clearance
            End If
      End If
           
      If Lt > 0 Then           
        .ExtendCode = ecStart
        .ExtendToWebEx LT, LeftJoist, - Clearance
        .ExtendCode = ecEnd
        .ExtendToWebEx LT, RightJoist, - Clearance
      End If
      .AutoExtend = True
                      
      'Place left jack stud 
'      If LT > -1 and LJackTop > -1 Then
'        F = .PlaceFrameObject(fotJackStud,LJStudX & ","& Head + (LJackTopDist/2),"@" & 10 & "<90", NOT_FLIPPED, stStud)
'        .ExtendCode = ecStart
'              .ExtendToWeb F, LT
'        .ExtendCode = ecEnd
'              .ExtendToWeb F, LJackTop
'            End If
            
      'Place right jack stud 
'      If LT > -1 and RJackTop > -1 Then
'        F = .PlaceFrameObject(fotJackStud,RJStudX & ","& Head + (RJackTopDist/2), "@" & 10 & "<90", FLIPPED, stStud)
'        .ExtendCode = ecStart
'               .ExtendToWeb F, LT
'        .ExtendCode = ecEnd
'              .ExtendToWeb F, RJackTop
'            End If
            
        End With
    End Sub
  
  Private Function Max2(Value1,Value2)
    if Value1 > Value2 Then
      Max2 = Value1
    Else
      Max2 = Value2
    End If
  End Function
  
  Private Function Max4(Value1,Value2,Value3,Value4)
  Dim FirstTest,SecondTest
  
    FirstTest = Max2(Value1,Value2)
    SecondTest = Max2(Value3,Value4)
    Max4 = Max2(FirstTest,SecondTest)
  End Function
    
    Public Function Extents
        Dim aTop, aBot

        'aTop = Max4(LTopDist,LJackTopDist,RTopDist,RJackTopDist) + OpeningMidY
        'aBot = OpeningMidY - Max2(LBotDist,RBotDist)
      
        aTop = Head
        aBot = Sill
      
        With CAD
            Extents = Array(aTop-1 , FOffset - .StudElevationWidth, aBot+1, FOffset + FWidth + .StudElevationWidth)
        End With
    End Function

    Public Function GetPosition
         GetPosition = Array(FOffset,FWidth)
    End Function

    Private Sub Class_Initialize()
        Head = 2020.0
        Offset = 200.0
        Width = 800.0
        Sill = 0.0
        Clearance = 0.0
        Header_Type = Array("Single","Boxed","Boxed plus Single")
        Trimmer_Type = Array("Single","Boxed")
'        WebDistance = 300.0
        Centered = False
    End Sub

End Class

