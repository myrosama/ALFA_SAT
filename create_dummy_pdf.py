from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Arial", size=12)

# Add a math question with a table
pdf.cell(200, 10, txt="Question 1", ln=1, align='L')
pdf.multi_cell(0, 10, txt="Based on the table below, what is the value of x when y is 4?")

# Draw a simple table manually (FPDF1 style)
pdf.cell(40, 10, "x", border=1)
pdf.cell(40, 10, "y", border=1, ln=1)
pdf.cell(40, 10, "2", border=1)
pdf.cell(40, 10, "4", border=1, ln=1)
pdf.cell(40, 10, "3", border=1)
pdf.cell(40, 10, "6", border=1, ln=1)

pdf.multi_cell(0, 10, txt="\nA) 2\nB) 3\nC) 4\nD) 6")

pdf.add_page()
# Add a math question with a diagram
pdf.cell(200, 10, txt="Question 2", ln=1, align='L')
pdf.multi_cell(0, 10, txt="What is the area of the rectangle shown below?")

# Draw a rectangle diagram
pdf.rect(50, 50, 100, 50)
pdf.text(100, 45, "Width = 10")
pdf.text(35, 75, "Height = 5")

pdf.set_xy(10, 110)
pdf.multi_cell(0, 10, txt="\nA) 15\nB) 25\nC) 50\nD) 100")

pdf.output("dummy_test.pdf")
print("✅ dummy_test.pdf created")
