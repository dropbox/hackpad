/**
 * Copyright 2009 Google Inc.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package net.appjet.common.util;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.IOException;
import java.io.*;


/**
 * A bunch of stuff that should've been in the Java Standard Libraries.
 */
public class BetterFile {
    public static String getFileContents(File f, boolean t) throws FileNotFoundException {
        FileInputStream in;
        try {
            in = new FileInputStream(f);
        } catch (FileNotFoundException e) {
            if (t) throw e;
            return null;
        }
        return getStreamContents(in);
    }

    public static String getFileContents(File f) {
        try {
            return getFileContents(f, false);
        } catch (FileNotFoundException e) {
            // won't ever get here.
        }  
        return null;
    }
    
    public static String getBinaryFileContents(File f) {
        FileInputStream in;
        try {
            in = new FileInputStream(f);
        } catch (FileNotFoundException e) {
            e.printStackTrace();
            return null;
        }

        return getBinaryStreamContents(in);
    }

    // Using the non-converting String contructor here. Yum.
    @SuppressWarnings({"deprecation"})
    public static String getBinaryStreamContents(InputStream in) {
        StringBuilder out = new StringBuilder();
        byte[] b = new byte[4096];
        try {
            for (int n; (n = in.read(b)) != -1 ;) {
                out.append(new String(b, 0, 0, n));
            }
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
        return out.toString();
    }

    public static String getStreamContents(InputStream instream) {
        InputStreamReader in = new InputStreamReader(instream, java.nio.charset.Charset.forName("UTF-8"));
        StringBuilder out = new StringBuilder();

        char[] b = new char[4096];
        try {
            for (int n; (n = in.read(b)) != -1; ){
                out.append(b, 0, n);
            }
            in.close();
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
        return out.toString();
    }        

    public static String getBinaryFileContents(String filename) {
        return getBinaryFileContents(new File(filename));
    }

    public static String getFileContents(String filename) {
        return getFileContents(new File(filename));
    }

    public static String getFileContents(String filename, boolean t) throws FileNotFoundException {
        return getFileContents(new File(filename), t);
    }

    public static byte[] getStreamBytes(InputStream instream) {
        byte[] b = new byte[8192];
        ByteArrayOutputStream baos = new ByteArrayOutputStream(16384);
        try {
            for (int n; (n = instream.read(b)) != -1;) {
                baos.write(b, 0, n);
            }
            instream.close();
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
        return baos.toByteArray();
    }
    
    public static String getReaderString(BufferedReader reader) {
      StringBuffer out = new StringBuffer();
      char[] c = new char[8192];
      try {
        for (int n; (n = reader.read(c, 0, c.length)) != -1;) {
          out.append(c, 0, n);
        }
        reader.close();
      } catch (IOException e) {
        e.printStackTrace();
        return null;
      }
      return out.toString();
    }

    public static byte[] getFileBytes(File f) {
        try {
            return getStreamBytes(new FileInputStream(f));
        } catch (IOException e) {
            e.printStackTrace();
            return null;
        }
    }

    public static byte[] getFileBytes(String filename) {
        return getFileBytes(new File(filename));
    }

    public static String getUnicodeFile(File f) throws FileNotFoundException {
            return getReaderString(new BufferedReader(new UnicodeReader(new FileInputStream(f), null)));
    }

    public static String getUnicodeFile(String filename) throws FileNotFoundException {
            return getUnicodeFile(new File(filename));
    }
    
    public static String stringFromUnicode(byte[] bytes) {
            return getReaderString(new BufferedReader(new UnicodeReader(new ByteArrayInputStream(bytes), null)));
    }

    // Ripped from: http://koti.mbnet.fi/akini/java/unicodereader/
    /**
     version: 1.1 / 2007-01-25
     - changed BOM recognition ordering (longer boms first)

     Original pseudocode   : Thomas Weidenfeller
     Implementation tweaked: Aki Nieminen

     http://www.unicode.org/unicode/faq/utf_bom.html
     BOMs:
       00 00 FE FF    = UTF-32, big-endian
       FF FE 00 00    = UTF-32, little-endian
       EF BB BF       = UTF-8,
       FE FF          = UTF-16, big-endian
       FF FE          = UTF-16, little-endian

     Win2k Notepad:
       Unicode format = UTF-16LE
    ***/

    /**
     * Generic unicode textreader, which will use BOM mark
     * to identify the encoding to be used. If BOM is not found
     * then use a given default or system encoding.
     */
    public static class UnicodeReader extends Reader {
       PushbackInputStream internalIn;
       InputStreamReader   internalIn2 = null;
       String              defaultEnc;

       private static final int BOM_SIZE = 4;

       /**
        *
        * @param in  inputstream to be read
        * @param defaultEnc default encoding if stream does not have 
        *                   BOM marker. Give NULL to use system-level default.
        */
       UnicodeReader(InputStream in, String defaultEnc) {
          internalIn = new PushbackInputStream(in, BOM_SIZE);
          this.defaultEnc = defaultEnc;
       }

       public String getDefaultEncoding() {
          return defaultEnc;
       }

       /**
        * Get stream encoding or NULL if stream is uninitialized.
        * Call init() or read() method to initialize it.
        */
       public String getEncoding() {
          if (internalIn2 == null) return null;
          return internalIn2.getEncoding();
       }

       /**
        * Read-ahead four bytes and check for BOM marks. Extra bytes are
        * unread back to the stream, only BOM bytes are skipped.
        */
       protected void init() throws IOException {
          if (internalIn2 != null) return;

          String encoding;
          byte bom[] = new byte[BOM_SIZE];
          int n, unread;
          n = internalIn.read(bom, 0, bom.length);

          if ( (bom[0] == (byte)0x00) && (bom[1] == (byte)0x00) &&
                      (bom[2] == (byte)0xFE) && (bom[3] == (byte)0xFF) ) {
             encoding = "UTF-32BE";
             unread = n - 4;
          } else if ( (bom[0] == (byte)0xFF) && (bom[1] == (byte)0xFE) &&
                      (bom[2] == (byte)0x00) && (bom[3] == (byte)0x00) ) {
             encoding = "UTF-32LE";
             unread = n - 4;
          } else if (  (bom[0] == (byte)0xEF) && (bom[1] == (byte)0xBB) &&
                (bom[2] == (byte)0xBF) ) {
             encoding = "UTF-8";
             unread = n - 3;
          } else if ( (bom[0] == (byte)0xFE) && (bom[1] == (byte)0xFF) ) {
             encoding = "UTF-16BE";
             unread = n - 2;
          } else if ( (bom[0] == (byte)0xFF) && (bom[1] == (byte)0xFE) ) {
             encoding = "UTF-16LE";
             unread = n - 2;
          } else {
             // Unicode BOM mark not found, unread all bytes
             encoding = defaultEnc;
             unread = n;
          }    
          //System.out.println("read=" + n + ", unread=" + unread);

          if (unread > 0) internalIn.unread(bom, (n - unread), unread);

          // Use given encoding
          if (encoding == null) {
             internalIn2 = new InputStreamReader(internalIn);
          } else {
             internalIn2 = new InputStreamReader(internalIn, encoding);
          }
       }

       public void close() throws IOException {
          init();
          internalIn2.close();
       }

       public int read(char[] cbuf, int off, int len) throws IOException {
          init();
          return internalIn2.read(cbuf, off, len);
       }

    }
}
