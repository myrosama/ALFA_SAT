import fitz
doc = fitz.open("../pdfs/2023 Dec Int-A @EliteXSAT.pdf")
print("PAGE 1 TEXT START")
print(doc[0].get_text("text")[:500])
print("PAGE 1 TEXT END")
