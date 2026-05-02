Private Function DivideSpace(ByRef Length, Max)
    Dim GapLength, NumGaps

    If (Length = 0) or (Max = 0) Then
        DivideSpace = 0
        Length = 0
    Else
        NumGaps = 1
        GapLength = Length

        While GapLength > Max
            NumGaps = NumGaps + 1
            GapLength = Length / NumGaps
        Wend

        DivideSpace = NumGaps
        Length = GapLength
    End If
End Function

Private Function DivideSpaceOdd(ByRef Length, Max)
    Dim GapLength, NumGaps

    If (Length = 0) or (Max = 0) Then
        DivideSpaceOdd = 0
        Length = 0
    Else
        NumGaps = 1
        GapLength = Length

        While GapLength > Max
            NumGaps = NumGaps + 1
            GapLength = Length / NumGaps
        Wend

        If NumGaps Mod 2 = 0 Then
            NumGaps = NumGaps + 1
            GapLength = Length / NumGaps
        End If

        DivideSpaceOdd = NumGaps
        Length = GapLength
    End If
End Function

Private Function DivideSpaceEven(ByRef Length, Max)
    Dim GapLength, NumGaps

    If (Length = 0) or (Max = 0) Then
        DivideSpaceEven = 0
        Length = 0
    Else
        NumGaps = 1
        GapLength = Length

        While GapLength > Max
            NumGaps = NumGaps + 1
            GapLength = Length / NumGaps
        Wend

        If NumGaps Mod 2 <> 0 Then
            NumGaps = NumGaps + 1
            GapLength = Length / NumGaps
        End If

        DivideSpaceEven = NumGaps
        Length = GapLength
    End If
End Function
