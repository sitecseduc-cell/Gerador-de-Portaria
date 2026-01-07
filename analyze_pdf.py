from pypdf import PdfReader
import sys

try:
    reader = PdfReader(r"c:\Users\jovap\Downloads\PORTARIA_BASE A_FINAL.pdf")
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n\n"
    
    print("--- START PDF CONTENT ---")
    print(text)
    print("--- END PDF CONTENT ---")
except Exception as e:
    print(f"Error reading PDF: {e}")
