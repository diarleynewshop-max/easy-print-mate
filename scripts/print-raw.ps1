param(
  [Parameter(Mandatory = $true)]
  [string]$PrinterName,

  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper
{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA
  {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void SendFile(string printerName, string filePath)
  {
    IntPtr printer;
    if (!OpenPrinter(printerName.Normalize(), out printer, IntPtr.Zero)) {
      throw new Exception("Nao foi possivel abrir a impressora: " + printerName);
    }

    try {
      DOCINFOA doc = new DOCINFOA();
      doc.pDocName = "Etiqueta PRN";
      doc.pDataType = "RAW";

      if (!StartDocPrinter(printer, 1, doc)) throw new Exception("StartDocPrinter falhou.");
      if (!StartPagePrinter(printer)) throw new Exception("StartPagePrinter falhou.");

      byte[] bytes = File.ReadAllBytes(filePath);
      IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
      Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);

      try {
        int written;
        if (!WritePrinter(printer, unmanagedBytes, bytes.Length, out written)) {
          throw new Exception("WritePrinter falhou.");
        }
        if (written != bytes.Length) {
          throw new Exception("WritePrinter gravou menos bytes que o esperado.");
        }
      } finally {
        Marshal.FreeCoTaskMem(unmanagedBytes);
      }

      EndPagePrinter(printer);
      EndDocPrinter(printer);
    } finally {
      ClosePrinter(printer);
    }
  }
}
"@

[RawPrinterHelper]::SendFile($PrinterName, $FilePath)
