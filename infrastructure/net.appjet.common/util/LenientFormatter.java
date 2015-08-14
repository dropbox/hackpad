/* Portions Copyright 2009 Google Inc.
 * The rest licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF and Google license this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package net.appjet.common.util;

import java.util.*;
import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.Flushable;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintStream;
import java.io.UnsupportedEncodingException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.MathContext;
import java.nio.CharBuffer;
import java.nio.charset.Charset;
import java.security.AccessController;
import java.security.PrivilegedAction;
import java.text.DateFormatSymbols;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.NumberFormat;

/**
 * <p>The {@code LenientFormatter} class is a copy of {@code java.util.Formatter}
 * that is lenient in the exact type of {@code java.lang.Number} passed into
 * certain flags (integer, floating point, date, and character formats).</p>
 * 
 * <p>The {@code Formatter} class is a String-formatting utility that is designed
 * to work like the {@code printf} function of the C programming language.
 * Its key methods are the {@code format} methods which create a formatted
 * {@code String} by replacing a set of placeholders (format tokens) with formatted
 * values. The style used to format each value is determined by the format
 * token used.  For example, the call<br/>
 * {@code format("My decimal value is %d and my String is %s.", 3, "Hello");}<br/>
 * returns the {@code String}<br/>
 * {@code My decimal value is 3 and my String is Hello.}
 *
 * <p>The format token consists of a percent sign, optionally followed
 * by flags and precision arguments, and then a single character that
 * indicates the type of value
 * being formatted.  If the type is a time/date, then the type character
 * {@code t} is followed by an additional character that indicates how the
 * date is to be formatted. The two characters {@code <$} immediately
 * following the % sign indicate that the previous value should be used again
 * instead of moving on to the next value argument. A number {@code n}
 * and a dollar sign immediately following the % sign make n the next argument
 * to be used.
 *
 * <p>The available choices are the following:
 *
 * <table BORDER="1" WIDTH="100%" CELLPADDING="3" CELLSPACING="0" SUMMARY="">
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Text value types</B></TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code s}</td>
 * <td width="10%">String</td>
 * <td width="30%">{@code format("%s, %s", "hello", "Hello");}</td>
 * <td width="30%">{@code hello, Hello}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code S}, {@code s}</td>
 * <td width="10%">String to capitals</td>
 * <td width="30%">{@code format("%S, %S", "hello", "Hello");}</td>
 * <td width="30%">{@code HELLO, HELLO}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code c}</td>
 * <td width="10%">Character</td>
 * <td width="30%">{@code format("%c, %c", 'd', 0x65);}</td>
 * <td width="30%">{@code d, e}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code C}</td>
 * <td width="10%">Character to capitals</td>
 * <td width="30%">{@code format("%C, %C", 'd', 0x65);}</td>
 * <td width="30%">{@code D, E}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Text option flags</B><br/>The value between the
 * option and the type character indicates the minimum width in
 * characters of the formatted value  </TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code -}</td>
 * <td width="10%">Left justify (width value is required)</td>
 * <td width="30%">{@code format("%-3C, %3C", 'd', 0x65);}</td>
 * <td width="30%">{@code D  ,   E}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Integer types</B></TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code d}</td>
 * <td width="10%">int, formatted as decimal</td>
 * <td width="30%">{@code format("%d, %d"1$, 35, 0x10);}</td>
 * <td width="30%">{@code 35, 16}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code o}</td>
 * <td width="10%">int, formatted as octal</td>
 * <td width="30%">{@code format("%o, %o", 8, 010);}</td>
 * <td width="30%">{@code 10, 10}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code X}, {@code x}</td>
 * <td width="10%">int, formatted as hexidecimal</td>
 * <td width="30%">{@code format("%x, %X", 10, 10);}</td>
 * <td width="30%">{@code a, A}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Integer option flags</B><br/>The value between the
 * option and the type character indicates the minimum width in
 * characters of the formatted value  </TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code +}</td>
 * <td width="10%">lead with the number's sign</td>
 * <td width="30%">{@code format("%+d, %+4d", 5, 5);}</td>
 * <td width="30%">{@code +5,   +5}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code -}</td>
 * <td width="10%">Left justify (width value is required)</td>
 * <td width="30%">{@code format("%-6dx", 5);}</td>
 * <td width="30%">{@code 5      x}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code #}</td>
 * <td width="10%">Print the leading characters that indicate
 * hexidecimal or octal (for use only with hex and octal types) </td>
 * <td width="30%">{@code format("%#o", 010);}</td>
 * <td width="30%">{@code 010}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code  }</td>
 * <td width="10%">A space indicates that non-negative numbers
 * should have a leading space. </td>
 * <td width="30%">{@code format("x% d% 5d", 4, 4);}</td>
 * <td width="30%">{@code x 4    4}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code 0}</td>
 * <td width="10%">Pad the number with leading zeros (width value is required)</td>
 * <td width="30%">{@code format("%07d, %03d", 4, 5555);}</td>
 * <td width="30%">{@code 0000004, 5555}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code (}</td>
 * <td width="10%">Put parentheses around negative numbers (decimal only)</td>
 * <td width="30%">{@code format("%(d, %(d, %(6d", 12, -12, -12);}</td>
 * <td width="30%">{@code 12, (12),   (12)}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Float types</B><br/>A value immediately following the % symbol
 * gives the minimum width in characters of the formatted value; if it
 * is followed by a period and another integer, then the second value
 * gives the precision (6 by default).</TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code f}</td>
 * <td width="10%">float (or double) formatted as a decimal, where
 * the precision indicates the number of digits after the decimal.</td>
 * <td width="30%">{@code format("%f %<.1f %<1.5f %<10f %<6.0f", 123.456f);}</td>
 * <td width="30%">{@code 123.456001 123.5 123.45600 123.456001    123}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code E}, {@code e}</td>
 * <td width="10%">float (or double) formatted in decimal exponential
 * notation, where the precision indicates the number of significant digits.</td>
 * <td width="30%">{@code format("%E %<.1e %<1.5E %<10E %<6.0E", 123.456f);}</td>
 * <td width="30%">{@code 1.234560E+02 1.2e+02 1.23456E+02 1.234560E+02  1E+02}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code G}, {@code g}</td>
 * <td width="10%">float (or double) formatted in decimal exponential
 * notation , where the precision indicates the maximum number of significant digits.</td>
 * <td width="30%">{@code format("%G %<.1g %<1.5G %<10G %<6.0G", 123.456f);}</td>
 * <td width="30%">{@code 123.456 1e+02 123.46    123.456  1E+02}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code A}, {@code a}</td>
 * <td width="10%">float (or double) formatted as a hexidecimal in exponential
 * notation, where the precision indicates the number of significant digits.</td>
 * <td width="30%">{@code format("%A %<.1a %<1.5A %<10A %<6.0A", 123.456f);}</td>
 * <td width="30%">{@code 0X1.EDD2F2P6 0x1.fp6 0X1.EDD2FP6 0X1.EDD2F2P6 0X1.FP6}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Float-type option flags</B><br/>See the Integer-type options.
 * The options for float-types are the
 * same as for integer types with one addition: </TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code ,}</td>
 * <td width="10%">Use a comma in place of a decimal if the locale
 * requires it. </td>
 * <td width="30%">{@code format(new Locale("fr"), "%,7.2f", 6.03f);}</td>
 * <td width="30%">{@code    6,03}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Date types</B></TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code t}, {@code T}</td>
 * <td width="10%">Date</td>
 * <td width="30%">{@code format(new Locale("fr"), "%tB %TB", Calendar.getInstance(), Calendar.getInstance());}</td>
 * <td width="30%">{@code avril AVRIL}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Date format precisions</B><br/>The format precision character
 * follows the {@code t}. </TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code A}, {@code a}</td>
 * <td width="10%">The day of the week</td>
 * <td width="30%">{@code format("%ta %tA", cal, cal);}</td>
 * <td width="30%">{@code Tue Tuesday}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code b}, {@code B}, {@code h}</td>
 * <td width="10%">The name of the month</td>
 * <td width="30%">{@code format("%tb %<tB %<th", cal, cal, cal);}</td>
 * <td width="30%">{@code Apr April Apr}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code C}</td>
 * <td width="10%">The century</td>
 * <td width="30%">{@code format("%tC\n", cal);}</td>
 * <td width="30%">{@code 20}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code d}, {@code e}</td>
 * <td width="10%">The day of the month (with or without leading zeros)</td>
 * <td width="30%">{@code format("%td %te", cal, cal);}</td>
 * <td width="30%">{@code 01 1}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code F}</td>
 * <td width="10%">The complete date formatted as YYYY-MM-DD</td>
 * <td width="30%">{@code format("%tF", cal);}</td>
 * <td width="30%">{@code 2008-04-01}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code D}</td>
 * <td width="10%">The complete date formatted as MM/DD/YY
 * (not corrected for locale) </td>
 * <td width="30%">{@code format(new Locale("en_US"), "%tD", cal);<br/>format(new Locale("en_UK"), " %tD", cal);}</td>
 * <td width="30%">{@code 04/01/08 04/01/08}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code j}</td>
 * <td width="10%">The number of the day (from the beginning of the year).</td>
 * <td width="30%">{@code format("%tj\n", cal);}</td>
 * <td width="30%">{@code 092}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code m}</td>
 * <td width="10%">The number of the month</td>
 * <td width="30%">{@code format("%tm\n", cal);}</td>
 * <td width="30%">{@code 04}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code y}, {@code Y}</td>
 * <td width="10%">The year</td>
 * <td width="30%">{@code format("%ty %tY", cal, cal);}</td>
 * <td width="30%">{@code 08 2008}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code H}, {@code I}, {@code k}, {@code l}</td>
 * <td width="10%">The hour of the day, in 12 or 24 hour format, with or
 * without a leading zero</td>
 * <td width="30%">{@code format("%tH %tI %tk %tl", cal, cal, cal, cal);}</td>
 * <td width="30%">{@code 16 04 16 4}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code p}</td>
 * <td width="10%">a.m. or p.m.</td>
 * <td width="30%">{@code format("%tp %Tp", cal, cal);}</td>
 * <td width="30%">{@code pm PM}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code M}, {@code S}, {@code L}, {@code N}</td>
 * <td width="10%">The minutes, seconds, milliseconds, and nanoseconds</td>
 * <td width="30%">{@code format("%tM %tS %tL %tN", cal, cal, cal, cal);}</td>
 * <td width="30%">{@code 08 17 359 359000000}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code Z}, {@code z}</td>
 * <td width="10%">The time zone: its abbreviation or offset from GMT</td>
 * <td width="30%">{@code format("%tZ %tz", cal, cal);}</td>
 * <td width="30%">{@code CEST +0100}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code R}, {@code r}, {@code T}</td>
 * <td width="10%">The complete time</td>
 * <td width="30%">{@code format("%tR %tr %tT", cal, cal, cal);}</td>
 * <td width="30%">{@code 16:15 04:15:32 PM 16:15:32}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code s}, {@code Q}</td>
 * <td width="10%">The number of seconds or milliseconds from "the epoch"
 * (1 January 1970 00:00:00 UTC) </td>
 * <td width="30%">{@code format("%ts %tQ", cal, cal);}</td>
 * <td width="30%">{@code 1207059412 1207059412656}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code c}</td>
 * <td width="10%">The complete time and date</td>
 * <td width="30%">{@code format("%tc", cal);}</td>
 * <td width="30%">{@code Tue Apr 01 16:19:17 CEST 2008}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Other data types</B></TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code B}, {@code b}</td>
 * <td width="10%">Boolean</td>
 * <td width="30%">{@code format("%b, %B", true, false);}</td>
 * <td width="30%">{@code true, FALSE}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code H}, {@code h}</td>
 * <td width="10%">Hashcode</td>
 * <td width="30%">{@code format("%h, %H", obj, obj);}</td>
 * <td width="30%">{@code 190d11, 190D11}</td>
 * </tr>
 * <tr>
 * <td width="5%">{@code n}</td>
 * <td width="10%">line separator</td>
 * <td width="30%">{@code format("first%nsecond", "???");}</td>
 * <td width="30%">{@code first<br/>second}</td>
 * </tr>
 * <tr BGCOLOR="#CCCCFF" CLASS="TableHeadingColor">
 * <TD COLSPAN=4>
 * <B>Escape sequences</B></TD>
 * </tr>
 * <tr>
 * <td width="5%">{@code %}</td>
 * <td width="10%">Escape the % character</td>
 * <td width="30%">{@code format("%d%%, %d", 50, 60);}</td>
 * <td width="30%">{@code 50%, 60}</td>
 * </tr>
 * </table>
 *
 * <p>An instance of Formatter can be created to write the formatted
 * output to standard types of output streams.  Its functionality can
 * also be accessed through the format methods of an output stream
 * or of {@code String}:<br/>
 * {@code System.out.println(String.format("%ty\n", cal));}<br/>
 * {@code System.out.format("%ty\n", cal);}
 *
 * <p>The class is not multi-threaded safe. The user is responsible for
 * maintaining a thread-safe design if a {@code Formatter} is
 * accessed by multiple threads. 
 *
 * @since 1.5
 */
public final class LenientFormatter implements Closeable, Flushable {

    /**
     * The enumeration giving the available styles for formatting very large
     * decimal numbers.
     */
    public enum BigDecimalLayoutForm {
        /**
         * Use scientific style for BigDecimals.
         */
        SCIENTIFIC,
        /**
         * Use normal decimal/float style for BigDecimals.
         */
        DECIMAL_FLOAT
    }

    private Appendable out;

    private Locale locale;

    private boolean closed = false;

    private IOException lastIOException;

    /**
     * Constructs a {@code Formatter}.
     * 
     * The output is written to a {@code StringBuilder} which can be acquired by invoking
     * {@link #out()} and whose content can be obtained by calling
     * {@code toString()}.
     * 
     * The {@code Locale} for the {@code LenientFormatter} is the default {@code Locale}.
     */
    public LenientFormatter() {
        this(new StringBuilder(), Locale.getDefault());
    }

    /**
     * Constructs a {@code Formatter} whose output will be written to the
     * specified {@code Appendable}.
     * 
     * The locale for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param a
     *            the output destination of the {@code Formatter}. If {@code a} is {@code null},
     *            then a {@code StringBuilder} will be used.
     */
    public LenientFormatter(Appendable a) {
        this(a, Locale.getDefault());
    }

    /**
     * Constructs a {@code Formatter} with the specified {@code Locale}.
     * 
     * The output is written to a {@code StringBuilder} which can be acquired by invoking
     * {@link #out()} and whose content can be obtained by calling
     * {@code toString()}.
     * 
     * @param l
     *            the {@code Locale} of the {@code Formatter}. If {@code l} is {@code null},
     *            then no localization will be used.
     */
    public LenientFormatter(Locale l) {
        this(new StringBuilder(), l);
    }

    /**
     * Constructs a {@code Formatter} with the specified {@code Locale}
     * and whose output will be written to the
     * specified {@code Appendable}.
     * 
     * @param a
     *            the output destination of the {@code Formatter}. If {@code a} is {@code null},
     *            then a {@code StringBuilder} will be used.
     * @param l
     *            the {@code Locale} of the {@code Formatter}. If {@code l} is {@code null},
     *            then no localization will be used.
     */
    public LenientFormatter(Appendable a, Locale l) {
        if (null == a) {
            out = new StringBuilder();
        } else {
            out = a;
        }
        locale = l;
    }

    /**
     * Constructs a {@code Formatter} whose output is written to the specified file.
     * 
     * The charset of the {@code Formatter} is the default charset.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param fileName
     *            the filename of the file that is used as the output
     *            destination for the {@code Formatter}. The file will be truncated to
     *            zero size if the file exists, or else a new file will be
     *            created. The output of the {@code Formatter} is buffered.
     * @throws FileNotFoundException
     *             if the filename does not denote a normal and writable file,
     *             or if a new file cannot be created, or if any error arises when
     *             opening or creating the file.
     * @throws SecurityException
     *             if there is a {@code SecurityManager} in place which denies permission
     *             to write to the file in {@code checkWrite(file.getPath())}.
     */
    public LenientFormatter(String fileName) throws FileNotFoundException {
        this(new File(fileName));

    }

    /**
     * Constructs a {@code Formatter} whose output is written to the specified file.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param fileName
     *            the filename of the file that is used as the output
     *            destination for the {@code Formatter}. The file will be truncated to
     *            zero size if the file exists, or else a new file will be
     *            created. The output of the {@code Formatter} is buffered.
     * @param csn
     *            the name of the charset for the {@code Formatter}.
     * @throws FileNotFoundException
     *             if the filename does not denote a normal and writable file,
     *             or if a new file cannot be created, or if any error arises when
     *             opening or creating the file.
     * @throws SecurityException
     *             if there is a {@code SecurityManager} in place which denies permission
     *             to write to the file in {@code checkWrite(file.getPath())}.
     * @throws UnsupportedEncodingException
     *             if the charset with the specified name is not supported.
     */
    public LenientFormatter(String fileName, String csn) throws FileNotFoundException,
            UnsupportedEncodingException {
        this(new File(fileName), csn);
    }

    /**
     * Constructs a {@code Formatter} with the given {@code Locale} and charset,
     * and whose output is written to the specified file.
     * 
     * @param fileName
     *            the filename of the file that is used as the output
     *            destination for the {@code Formatter}. The file will be truncated to
     *            zero size if the file exists, or else a new file will be
     *            created. The output of the {@code Formatter} is buffered.
     * @param csn
     *            the name of the charset for the {@code Formatter}.
     * @param l
     *            the {@code Locale} of the {@code Formatter}. If {@code l} is {@code null},
     *            then no localization will be used.
     * @throws FileNotFoundException
     *             if the filename does not denote a normal and writable file,
     *             or if a new file cannot be created, or if any error arises when
     *             opening or creating the file.
     * @throws SecurityException
     *             if there is a {@code SecurityManager} in place which denies permission
     *             to write to the file in {@code checkWrite(file.getPath())}.
     * @throws UnsupportedEncodingException
     *             if the charset with the specified name is not supported.
     */
    public LenientFormatter(String fileName, String csn, Locale l)
            throws FileNotFoundException, UnsupportedEncodingException {

        this(new File(fileName), csn, l);
    }

    /**
     * Constructs a {@code Formatter} whose output is written to the specified {@code File}.
     * 
     * The charset of the {@code Formatter} is the default charset.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param file
     *            the {@code File} that is used as the output destination for the
     *            {@code Formatter}. The {@code File} will be truncated to zero size if the {@code File}
     *            exists, or else a new {@code File} will be created. The output of the
     *            {@code Formatter} is buffered.
     * @throws FileNotFoundException
     *             if the {@code File} is not a normal and writable {@code File}, or if a
     *             new {@code File} cannot be created, or if any error rises when opening or
     *             creating the {@code File}.
     * @throws SecurityException
     *             if there is a {@code SecurityManager} in place which denies permission
     *             to write to the {@code File} in {@code checkWrite(file.getPath())}.
     */
    public LenientFormatter(File file) throws FileNotFoundException {
        this(new FileOutputStream(file));
    }

    /**
     * Constructs a {@code Formatter} with the given charset,
     * and whose output is written to the specified {@code File}.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param file
     *            the {@code File} that is used as the output destination for the
     *            {@code Formatter}. The {@code File} will be truncated to zero size if the {@code File}
     *            exists, or else a new {@code File} will be created. The output of the
     *            {@code Formatter} is buffered.
     * @param csn
     *            the name of the charset for the {@code Formatter}.
     * @throws FileNotFoundException
     *             if the {@code File} is not a normal and writable {@code File}, or if a
     *             new {@code File} cannot be created, or if any error rises when opening or
     *             creating the {@code File}.
     * @throws SecurityException
     *             if there is a {@code SecurityManager} in place which denies permission
     *             to write to the {@code File} in {@code checkWrite(file.getPath())}.
     * @throws UnsupportedEncodingException
     *             if the charset with the specified name is not supported.
     */
    public LenientFormatter(File file, String csn) throws FileNotFoundException,
            UnsupportedEncodingException {
        this(file, csn, Locale.getDefault());
    }

    /**
     * Constructs a {@code Formatter} with the given {@code Locale} and charset,
     * and whose output is written to the specified {@code File}.
     * 
     * @param file
     *            the {@code File} that is used as the output destination for the
     *            {@code Formatter}. The {@code File} will be truncated to zero size if the {@code File}
     *            exists, or else a new {@code File} will be created. The output of the
     *            {@code Formatter} is buffered.
     * @param csn
     *            the name of the charset for the {@code Formatter}.
     * @param l
     *            the {@code Locale} of the {@code Formatter}. If {@code l} is {@code null},
     *            then no localization will be used.
     * @throws FileNotFoundException
     *             if the {@code File} is not a normal and writable {@code File}, or if a
     *             new {@code File} cannot be created, or if any error rises when opening or
     *             creating the {@code File}.
     * @throws SecurityException
     *             if there is a {@code SecurityManager} in place which denies permission
     *             to write to the {@code File} in {@code checkWrite(file.getPath())}.
     * @throws UnsupportedEncodingException
     *             if the charset with the specified name is not supported.
     */
    public LenientFormatter(File file, String csn, Locale l)
            throws FileNotFoundException, UnsupportedEncodingException {
        FileOutputStream fout = null;
        try {
            fout = new FileOutputStream(file);
            OutputStreamWriter writer = new OutputStreamWriter(fout, csn);
            out = new BufferedWriter(writer);
        } catch (RuntimeException e) {
            closeOutputStream(fout);
            throw e;
        } catch (UnsupportedEncodingException e) {
            closeOutputStream(fout);
            throw e;
        }

        locale = l;
    }

    /**
     * Constructs a {@code Formatter} whose output is written to the specified {@code OutputStream}.
     * 
     * The charset of the {@code Formatter} is the default charset.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param os
     *            the stream to be used as the destination of the {@code Formatter}.
     */
    public LenientFormatter(OutputStream os) {
        OutputStreamWriter writer = new OutputStreamWriter(os, Charset
                .defaultCharset());
        out = new BufferedWriter(writer);
        locale = Locale.getDefault();
    }

    /**
     * Constructs a {@code Formatter} with the given charset,
     * and whose output is written to the specified {@code OutputStream}.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param os
     *            the stream to be used as the destination of the {@code Formatter}.
     * @param csn
     *            the name of the charset for the {@code Formatter}.
     * @throws UnsupportedEncodingException
     *             if the charset with the specified name is not supported.
     */
    public LenientFormatter(OutputStream os, String csn)
            throws UnsupportedEncodingException {

        this(os, csn, Locale.getDefault());
    }

    /**
     * Constructs a {@code Formatter} with the given {@code Locale} and charset,
     * and whose output is written to the specified {@code OutputStream}.
     * 
     * @param os
     *            the stream to be used as the destination of the {@code Formatter}.
     * @param csn
     *            the name of the charset for the {@code Formatter}.
     * @param l
     *            the {@code Locale} of the {@code Formatter}. If {@code l} is {@code null},
     *            then no localization will be used.
     * @throws UnsupportedEncodingException
     *             if the charset with the specified name is not supported.
     */
    public LenientFormatter(OutputStream os, String csn, Locale l)
            throws UnsupportedEncodingException {

        OutputStreamWriter writer = new OutputStreamWriter(os, csn);
        out = new BufferedWriter(writer);

        locale = l;
    }

    /**
     * Constructs a {@code Formatter} whose output is written to the specified {@code PrintStream}.
     * 
     * The charset of the {@code Formatter} is the default charset.
     * 
     * The {@code Locale} for the {@code Formatter} is the default {@code Locale}.
     * 
     * @param ps
     *            the {@code PrintStream} used as destination of the {@code Formatter}. If
     *            {@code ps} is {@code null}, then a {@code NullPointerException} will
     *            be raised.
     */
    public LenientFormatter(PrintStream ps) {
        if (null == ps) {
            throw new NullPointerException();
        }
        out = ps;
        locale = Locale.getDefault();
    }

    private void checkClosed() {
        if (closed) {
            throw new FormatterClosedException();
        }
    }

    /**
     * Returns the {@code Locale} of the {@code Formatter}.
     * 
     * @return the {@code Locale} for the {@code Formatter} or {@code null} for no {@code Locale}.
     * @throws FormatterClosedException
     *             if the {@code Formatter} has been closed.
     */
    public Locale locale() {
        checkClosed();
        return locale;
    }

    /**
     * Returns the output destination of the {@code Formatter}.
     * 
     * @return the output destination of the {@code Formatter}.
     * @throws FormatterClosedException
     *             if the {@code Formatter} has been closed.
     */
    public Appendable out() {
        checkClosed();
        return out;
    }

    /**
     * Returns the content by calling the {@code toString()} method of the output
     * destination.
     * 
     * @return the content by calling the {@code toString()} method of the output
     *         destination.
     * @throws FormatterClosedException
     *             if the {@code Formatter} has been closed.
     */
    @Override
    public String toString() {
        checkClosed();
        return out.toString();
    }

    /**
     * Flushes the {@code Formatter}. If the output destination is {@link Flushable},
     * then the method {@code flush()} will be called on that destination.
     * 
     * @throws FormatterClosedException
     *             if the {@code Formatter} has been closed.
     */
    public void flush() {
        checkClosed();
        if (out instanceof Flushable) {
            try {
                ((Flushable) out).flush();
            } catch (IOException e) {
                lastIOException = e;
            }
        }
    }

    /**
     * Closes the {@code Formatter}. If the output destination is {@link Closeable},
     * then the method {@code close()} will be called on that destination.
     * 
     * If the {@code Formatter} has been closed, then calling the this method will have no
     * effect.
     * 
     * Any method but the {@link #ioException()} that is called after the
     * {@code Formatter} has been closed will raise a {@code FormatterClosedException}.
     */
    public void close() {
        closed = true;
        try {
            if (out instanceof Closeable) {
                ((Closeable) out).close();
            }
        } catch (IOException e) {

            lastIOException = e;
        }
    }

    /**
     * Returns the last {@code IOException} thrown by the {@code Formatter}'s output
     * destination. If the {@code append()} method of the destination does not throw
     * {@code IOException}s, the {@code ioException()} method will always return {@code null}.
     * 
     * @return the last {@code IOException} thrown by the {@code Formatter}'s output
     *         destination.
     */
    public IOException ioException() {
        return lastIOException;
    }

    /**
     * Writes a formatted string to the output destination of the {@code Formatter}.
     * 
     * @param format
     *            a format string.
     * @param args
     *            the arguments list used in the {@code format()} method. If there are
     *            more arguments than those specified by the format string, then
     *            the additional arguments are ignored.
     * @return this {@code Formatter}.
     * @throws IllegalFormatException
     *             if the format string is illegal or incompatible with the
     *             arguments, or if fewer arguments are sent than those required by
     *             the format string, or any other illegal situation.
     * @throws FormatterClosedException
     *             if the {@code Formatter} has been closed.
     */
    public LenientFormatter format(String format, Object... args) {
        return format(locale, format, args);
    }

    /**
     * Writes a formatted string to the output destination of the {@code Formatter}.
     * 
     * @param l
     *            the {@code Locale} used in the method. If {@code locale} is
     *            {@code null}, then no localization will be applied. This
     *            parameter does not influence the {@code Locale} specified during
     *            construction.
     * @param format
     *            a format string.
     * @param args
     *            the arguments list used in the {@code format()} method. If there are
     *            more arguments than those specified by the format string, then
     *            the additional arguments are ignored.
     * @return this {@code Formatter}.
     * @throws IllegalFormatException
     *             if the format string is illegal or incompatible with the
     *             arguments, or if fewer arguments are sent than those required by
     *             the format string, or any other illegal situation.
     * @throws FormatterClosedException
     *             if the {@code Formatter} has been closed.
     */
    public LenientFormatter format(Locale l, String format, Object... args) {
        checkClosed();
        CharBuffer formatBuffer = CharBuffer.wrap(format);
        ParserStateMachine parser = new ParserStateMachine(formatBuffer);
        Transformer transformer = new Transformer(this, l);

        int currentObjectIndex = 0;
        Object lastArgument = null;
        boolean hasLastArgumentSet = false;
        while (formatBuffer.hasRemaining()) {
            parser.reset();
            FormatToken token = parser.getNextFormatToken();
            String result;
            String plainText = token.getPlainText();
            if (token.getConversionType() == (char) FormatToken.UNSET) {
                result = plainText;
            } else {
                plainText = plainText.substring(0, plainText.indexOf('%'));
                Object argument = null;
                if (token.requireArgument()) {
                    int index = token.getArgIndex() == FormatToken.UNSET ? currentObjectIndex++
                            : token.getArgIndex();
                    argument = getArgument(args, index, token, lastArgument,
                            hasLastArgumentSet);
                    lastArgument = argument;
                    hasLastArgumentSet = true;
                }
                result = transformer.transform(token, argument);
                result = (null == result ? plainText : plainText + result);
            }
            // if output is made by formattable callback
            if (null != result) {
                try {
                    out.append(result);
                } catch (IOException e) {
                    lastIOException = e;
                }
            }
        }
        return this;
    }

    private Object getArgument(Object[] args, int index, FormatToken token,
            Object lastArgument, boolean hasLastArgumentSet) {
        if (index == FormatToken.LAST_ARGUMENT_INDEX && !hasLastArgumentSet) {
            throw new MissingFormatArgumentException("<"); //$NON-NLS-1$
        }

        if (null == args) {
            return null;
        }

        if (index >= args.length) {
            throw new MissingFormatArgumentException(token.getPlainText());
        }

        if (index == FormatToken.LAST_ARGUMENT_INDEX) {
            return lastArgument;
        }

        return args[index];
    }

    private static void closeOutputStream(OutputStream os) {
        if (null == os) {
            return;
        }
        try {
            os.close();

        } catch (IOException e) {
            // silently
        }
    }

    /*
     * Information about the format string of a specified argument, which
     * includes the conversion type, flags, width, precision and the argument
     * index as well as the plainText that contains the whole format string used
     * as the result for output if necessary. Besides, the string for flags is
     * recorded to construct corresponding FormatExceptions if necessary.
     */
    private static class FormatToken {

        static final int LAST_ARGUMENT_INDEX = -2;

        static final int UNSET = -1;

        static final int FLAGS_UNSET = 0;

        static final int DEFAULT_PRECISION = 6;

        static final int FLAG_MINUS = 1;

        static final int FLAG_SHARP = 1 << 1;

        static final int FLAG_ADD = 1 << 2;

        static final int FLAG_SPACE = 1 << 3;

        static final int FLAG_ZERO = 1 << 4;

        static final int FLAG_COMMA = 1 << 5;

        static final int FLAG_PARENTHESIS = 1 << 6;

        private static final int FLAGT_TYPE_COUNT = 6;

        private int formatStringStartIndex;

        private String plainText;

        private int argIndex = UNSET;

        private int flags = 0;

        private int width = UNSET;

        private int precision = UNSET;

        private StringBuilder strFlags = new StringBuilder(FLAGT_TYPE_COUNT);

        private char dateSuffix;// will be used in new feature.

        private char conversionType = (char) UNSET;

        boolean isPrecisionSet() {
            return precision != UNSET;
        }

        boolean isWidthSet() {
            return width != UNSET;
        }

        boolean isFlagSet(int flag) {
            return 0 != (flags & flag);
        }

        int getArgIndex() {
            return argIndex;
        }

        void setArgIndex(int index) {
            argIndex = index;
        }

        String getPlainText() {
            return plainText;
        }

        void setPlainText(String plainText) {
            this.plainText = plainText;
        }

        int getWidth() {
            return width;
        }

        void setWidth(int width) {
            this.width = width;
        }

        int getPrecision() {
            return precision;
        }

        void setPrecision(int precise) {
            this.precision = precise;
        }

        String getStrFlags() {
            return strFlags.toString();
        }

        int getFlags() {
            return flags;
        }

        void setFlags(int flags) {
            this.flags = flags;
        }

        /*
         * Sets qualified char as one of the flags. If the char is qualified,
         * sets it as a flag and returns true. Or else returns false.
         */
        boolean setFlag(char c) {
            int newFlag;
            switch (c) {
                case '-': {
                    newFlag = FLAG_MINUS;
                    break;
                }
                case '#': {
                    newFlag = FLAG_SHARP;
                    break;
                }
                case '+': {
                    newFlag = FLAG_ADD;
                    break;
                }
                case ' ': {
                    newFlag = FLAG_SPACE;
                    break;
                }
                case '0': {
                    newFlag = FLAG_ZERO;
                    break;
                }
                case ',': {
                    newFlag = FLAG_COMMA;
                    break;
                }
                case '(': {
                    newFlag = FLAG_PARENTHESIS;
                    break;
                }
                default:
                    return false;
            }
            if (0 != (flags & newFlag)) {
                throw new DuplicateFormatFlagsException(String.valueOf(c));
            }
            flags = (flags | newFlag);
            strFlags.append(c);
            return true;

        }

        int getFormatStringStartIndex() {
            return formatStringStartIndex;
        }

        void setFormatStringStartIndex(int index) {
            formatStringStartIndex = index;
        }

        char getConversionType() {
            return conversionType;
        }

        void setConversionType(char c) {
            conversionType = c;
        }

        char getDateSuffix() {
            return dateSuffix;
        }

        void setDateSuffix(char c) {
            dateSuffix = c;
        }

        boolean requireArgument() {
            return conversionType != '%' && conversionType != 'n';
        }
    }

    /*
     * Transforms the argument to the formatted string according to the format
     * information contained in the format token.
     */
    private static class Transformer {

        private LenientFormatter formatter;

        private FormatToken formatToken;

        private Object arg;

        private Locale locale;

        private static String lineSeparator;

        private NumberFormat numberFormat;

        private DecimalFormatSymbols decimalFormatSymbols;

        private DateTimeUtil dateTimeUtil;

        Transformer(LenientFormatter formatter, Locale locale) {
            this.formatter = formatter;
            this.locale = (null == locale ? Locale.US : locale);
        }

        private NumberFormat getNumberFormat() {
            if (null == numberFormat) {
                numberFormat = NumberFormat.getInstance(locale);
            }
            return numberFormat;
        }

        private DecimalFormatSymbols getDecimalFormatSymbols() {
            if (null == decimalFormatSymbols) {
                decimalFormatSymbols = new DecimalFormatSymbols(locale);
            }
            return decimalFormatSymbols;
        }

        /*
         * Gets the formatted string according to the format token and the
         * argument.
         */
        String transform(FormatToken token, Object argument) {

            /* init data member to print */
            this.formatToken = token;
            this.arg = argument;

            String result;
            switch (token.getConversionType()) {
                case 'B':
                case 'b': {
                    result = transformFromBoolean();
                    break;
                }
                case 'H':
                case 'h': {
                    result = transformFromHashCode();
                    break;
                }
                case 'S':
                case 's': {
                    result = transformFromString();
                    break;
                }
                case 'C':
                case 'c': {
                    result = transformFromCharacter();
                    break;
                }
                case 'd':
                case 'o':
                case 'x':
                case 'X': {
                    if (null == arg || arg instanceof BigInteger) {
                        result = transformFromBigInteger();
                    } else {
                        result = transformFromInteger();
                    }
                    break;
                }
                case 'e':
                case 'E':
                case 'g':
                case 'G':
                case 'f':
                case 'a':
                case 'A': {
                    result = transformFromFloat();
                    break;
                }
                case '%': {
                    result = transformFromPercent();
                    break;
                }
                case 'n': {
                    result = transformFromLineSeparator();
                    break;
                }
                case 't':
                case 'T': {
                    result = transformFromDateTime();
                    break;
                }
                default: {
                    throw new UnknownFormatConversionException(String
                            .valueOf(token.getConversionType()));
                }
            }

            if (Character.isUpperCase(token.getConversionType())) {
                if (null != result) {
                    result = result.toUpperCase(Locale.US);
                }
            }
            return result;
        }

        /*
         * Transforms the Boolean argument to a formatted string.
         */
        private String transformFromBoolean() {
            StringBuilder result = new StringBuilder();
            int startIndex = 0;
            int flags = formatToken.getFlags();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && !formatToken.isWidthSet()) {
                throw new MissingFormatWidthException("-" //$NON-NLS-1$
                        + formatToken.getConversionType());
            }

            // only '-' is valid for flags
            if (FormatToken.FLAGS_UNSET != flags
                    && FormatToken.FLAG_MINUS != flags) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), formatToken.getConversionType());
            }

            if (null == arg) {
                result.append("false"); //$NON-NLS-1$
            } else if (arg instanceof Boolean) {
                result.append(arg);
            } else {
                result.append("true"); //$NON-NLS-1$
            }
            return padding(result, startIndex);
        }

        /*
         * Transforms the hashcode of the argument to a formatted string.
         */
        private String transformFromHashCode() {
            StringBuilder result = new StringBuilder();

            int startIndex = 0;
            int flags = formatToken.getFlags();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && !formatToken.isWidthSet()) {
                throw new MissingFormatWidthException("-" //$NON-NLS-1$
                        + formatToken.getConversionType());
            }

            // only '-' is valid for flags
            if (FormatToken.FLAGS_UNSET != flags
                    && FormatToken.FLAG_MINUS != flags) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), formatToken.getConversionType());
            }

            if (null == arg) {
                result.append("null"); //$NON-NLS-1$
            } else {
                result.append(Integer.toHexString(arg.hashCode()));
            }
            return padding(result, startIndex);
        }

        /*
         * Transforms the String to a formatted string.
         */
        private String transformFromString() {
            StringBuilder result = new StringBuilder();
            int startIndex = 0;
            int flags = formatToken.getFlags();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && !formatToken.isWidthSet()) {
                throw new MissingFormatWidthException("-" //$NON-NLS-1$
                        + formatToken.getConversionType());
            }

            // only '-' is valid for flags if the argument is not an
            // instance of Formattable
            if (FormatToken.FLAGS_UNSET != flags
                    && FormatToken.FLAG_MINUS != flags) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), formatToken.getConversionType());
            }

            result.append(arg);
            return padding(result, startIndex);
        }

        /*
         * Transforms the Character to a formatted string.
         */
        private String transformFromCharacter() {
            StringBuilder result = new StringBuilder();

            int startIndex = 0;
            int flags = formatToken.getFlags();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && !formatToken.isWidthSet()) {
                throw new MissingFormatWidthException("-" //$NON-NLS-1$
                        + formatToken.getConversionType());
            }

            // only '-' is valid for flags
            if (FormatToken.FLAGS_UNSET != flags
                    && FormatToken.FLAG_MINUS != flags) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), formatToken.getConversionType());
            }

            if (formatToken.isPrecisionSet()) {
                throw new IllegalFormatPrecisionException(formatToken
                        .getPrecision());
            }

            if (null == arg) {
                result.append("null"); //$NON-NLS-1$
            } else {
                if (arg instanceof Character) {
                    result.append(arg);
                } else if (arg instanceof Byte) {
                    byte b = ((Byte) arg).byteValue();
                    if (!Character.isValidCodePoint(b)) {
                        throw new IllegalFormatCodePointException(b);
                    }
                    result.append((char) b);
                } else if (arg instanceof Short) {
                    short s = ((Short) arg).shortValue();
                    if (!Character.isValidCodePoint(s)) {
                        throw new IllegalFormatCodePointException(s);
                    }
                    result.append((char) s);
                } else if (arg instanceof Number) {
                    int codePoint = ((Number) arg).intValue();
                    if (!Character.isValidCodePoint(codePoint)) {
                        throw new IllegalFormatCodePointException(codePoint);
                    }
                    result.append(String.valueOf(Character.toChars(codePoint)));
                } else {
                    // argument of other class is not acceptable.
                    throw new IllegalFormatConversionException(formatToken
                            .getConversionType(), arg.getClass());
                }
            }
            return padding(result, startIndex);
        }

        /*
         * Transforms percent to a formatted string. Only '-' is legal flag.
         * Precision is illegal.
         */
        private String transformFromPercent() {
            StringBuilder result = new StringBuilder("%"); //$NON-NLS-1$

            int startIndex = 0;
            int flags = formatToken.getFlags();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && !formatToken.isWidthSet()) {
                throw new MissingFormatWidthException("-" //$NON-NLS-1$
                        + formatToken.getConversionType());
            }

            if (FormatToken.FLAGS_UNSET != flags
                    && FormatToken.FLAG_MINUS != flags) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), formatToken.getConversionType());
            }
            if (formatToken.isPrecisionSet()) {
                throw new IllegalFormatPrecisionException(formatToken
                        .getPrecision());
            }
            return padding(result, startIndex);
        }

        /*
         * Transforms line separator to a formatted string. Any flag, the width
         * or the precision is illegal.
         */
        private String transformFromLineSeparator() {
            if (formatToken.isPrecisionSet()) {
                throw new IllegalFormatPrecisionException(formatToken
                        .getPrecision());
            }

            if (formatToken.isWidthSet()) {
                throw new IllegalFormatWidthException(formatToken.getWidth());
            }

            int flags = formatToken.getFlags();
            if (FormatToken.FLAGS_UNSET != flags) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }

            if (null == lineSeparator) {
                lineSeparator = AccessController
                        .doPrivileged(new PrivilegedAction<String>() {

                            public String run() {
                                return System.getProperty("line.separator"); //$NON-NLS-1$
                            }
                        });
            }
            return lineSeparator;
        }

        /*
         * Pads characters to the formatted string.
         */
        private String padding(StringBuilder source, int startIndex) {
            int start = startIndex;
            boolean paddingRight = formatToken
                    .isFlagSet(FormatToken.FLAG_MINUS);
            char paddingChar = '\u0020';// space as padding char.
            if (formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                if ('d' == formatToken.getConversionType()) {
                    paddingChar = getDecimalFormatSymbols().getZeroDigit();
                } else {
                    paddingChar = '0';
                }
            } else {
                // if padding char is space, always padding from the head
                // location.
                start = 0;
            }
            int width = formatToken.getWidth();
            int precision = formatToken.getPrecision();

            int length = source.length();
            if (precision >= 0) {
                length = Math.min(length, precision);
                source.delete(length, source.length());
            }
            if (width > 0) {
                width = Math.max(source.length(), width);
            }
            if (length >= width) {
                return source.toString();
            }

            char[] paddings = new char[width - length];
            Arrays.fill(paddings, paddingChar);
            String insertString = new String(paddings);

            if (paddingRight) {
                source.append(insertString);
            } else {
                source.insert(start, insertString);
            }
            return source.toString();
        }

        /*
         * Transforms the Integer to a formatted string.
         */
        private String transformFromInteger() {
            int startIndex = 0;
            boolean isNegative = false;
            StringBuilder result = new StringBuilder();
            char currentConversionType = formatToken.getConversionType();
            long value;

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    || formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                if (!formatToken.isWidthSet()) {
                    throw new MissingFormatWidthException(formatToken
                            .getStrFlags());
                }
            }
            // Combination of '+' & ' ' is illegal.
            if (formatToken.isFlagSet(FormatToken.FLAG_ADD)
                    && formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }
            if (formatToken.isPrecisionSet()) {
                throw new IllegalFormatPrecisionException(formatToken
                        .getPrecision());
            }
            if (arg instanceof Long) {
                value = ((Long) arg).longValue();
            } else if (arg instanceof Integer) {
                value = ((Integer) arg).longValue();
            } else if (arg instanceof Short) {
                value = ((Short) arg).longValue();
            } else if (arg instanceof Byte) {
                value = ((Byte) arg).longValue();
            }
            else if (arg instanceof Number) {
                value = ((Number) arg).longValue();
            } else {
                throw new IllegalFormatConversionException(formatToken
                        .getConversionType(), arg.getClass());
            }
            if ('d' != currentConversionType) {
                if (formatToken.isFlagSet(FormatToken.FLAG_ADD)
                        || formatToken.isFlagSet(FormatToken.FLAG_SPACE)
                        || formatToken.isFlagSet(FormatToken.FLAG_COMMA)
                        || formatToken.isFlagSet(FormatToken.FLAG_PARENTHESIS)) {
                    throw new FormatFlagsConversionMismatchException(
                            formatToken.getStrFlags(), formatToken
                                    .getConversionType());
                }
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)) {
                if ('d' == currentConversionType) {
                    throw new FormatFlagsConversionMismatchException(
                            formatToken.getStrFlags(), formatToken
                                    .getConversionType());
                } else if ('o' == currentConversionType) {
                    result.append("0"); //$NON-NLS-1$
                    startIndex += 1;
                } else {
                    result.append("0x"); //$NON-NLS-1$
                    startIndex += 2;
                }
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }

            if (value < 0) {
                isNegative = true;
            }

            if ('d' == currentConversionType) {
                NumberFormat numberFormat = getNumberFormat();
                if (formatToken.isFlagSet(FormatToken.FLAG_COMMA)) {
                    numberFormat.setGroupingUsed(true);
                } else {
                    numberFormat.setGroupingUsed(false);
                }
                result.append(numberFormat.format(arg));
            } else {
                long BYTE_MASK = 0x00000000000000FFL;
                long SHORT_MASK = 0x000000000000FFFFL;
                long INT_MASK = 0x00000000FFFFFFFFL;
                if (isNegative) {
                    if (arg instanceof Byte) {
                        value &= BYTE_MASK;
                    } else if (arg instanceof Short) {
                        value &= SHORT_MASK;
                    } else if (arg instanceof Integer) {
                        value &= INT_MASK;
                    }
                }
                if ('o' == currentConversionType) {
                    result.append(Long.toOctalString(value));
                } else {
                    result.append(Long.toHexString(value));
                }
                isNegative = false;
            }

            if (!isNegative) {
                if (formatToken.isFlagSet(FormatToken.FLAG_ADD)) {
                    result.insert(0, '+');
                    startIndex += 1;
                }
                if (formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                    result.insert(0, ' ');
                    startIndex += 1;
                }
            }

            /* pad paddingChar to the output */
            if (isNegative
                    && formatToken.isFlagSet(FormatToken.FLAG_PARENTHESIS)) {
                result = wrapParentheses(result);
                return result.toString();

            }
            if (isNegative && formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                startIndex++;
            }
            return padding(result, startIndex);
        }

        /*
         * add () to the output,if the value is negative and
         * formatToken.FLAG_PARENTHESIS is set. 'result' is used as an in-out
         * parameter.
         */
        private StringBuilder wrapParentheses(StringBuilder result) {
            // delete the '-'
            result.deleteCharAt(0);
            result.insert(0, '(');
            if (formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                formatToken.setWidth(formatToken.getWidth() - 1);
                padding(result, 1);
                result.append(')');
            } else {
                result.append(')');
                padding(result, 0);
            }
            return result;
        }

        private String transformFromSpecialNumber() {
            String source = null;

            if (!(arg instanceof Number) || arg instanceof BigDecimal) {
                return null;
            }

            Number number = (Number) arg;
            double d = number.doubleValue();
            if (Double.isNaN(d)) {
                source = "NaN"; //$NON-NLS-1$
            } else if (Double.isInfinite(d)) {
                if (d >= 0) {
                    if (formatToken.isFlagSet(FormatToken.FLAG_ADD)) {
                        source = "+Infinity"; //$NON-NLS-1$
                    } else if (formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                        source = " Infinity"; //$NON-NLS-1$
                    } else {
                        source = "Infinity"; //$NON-NLS-1$
                    }
                } else {
                    if (formatToken.isFlagSet(FormatToken.FLAG_PARENTHESIS)) {
                        source = "(Infinity)"; //$NON-NLS-1$
                    } else {
                        source = "-Infinity"; //$NON-NLS-1$
                    }
                }
            }

            if (null != source) {
                formatToken.setPrecision(FormatToken.UNSET);
                formatToken.setFlags(formatToken.getFlags()
                        & (~FormatToken.FLAG_ZERO));
                source = padding(new StringBuilder(source), 0);
            }
            return source;
        }

        private String transformFromNull() {
            formatToken.setFlags(formatToken.getFlags()
                    & (~FormatToken.FLAG_ZERO));
            return padding(new StringBuilder("null"), 0); //$NON-NLS-1$
        }

        /*
         * Transforms a BigInteger to a formatted string.
         */
        private String transformFromBigInteger() {
            int startIndex = 0;
            boolean isNegative = false;
            StringBuilder result = new StringBuilder();
            BigInteger bigInt = (BigInteger) arg;
            char currentConversionType = formatToken.getConversionType();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    || formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                if (!formatToken.isWidthSet()) {
                    throw new MissingFormatWidthException(formatToken
                            .getStrFlags());
                }
            }

            // Combination of '+' & ' ' is illegal.
            if (formatToken.isFlagSet(FormatToken.FLAG_ADD)
                    && formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }

            // Combination of '-' & '0' is illegal.
            if (formatToken.isFlagSet(FormatToken.FLAG_ZERO)
                    && formatToken.isFlagSet(FormatToken.FLAG_MINUS)) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }

            if (formatToken.isPrecisionSet()) {
                throw new IllegalFormatPrecisionException(formatToken
                        .getPrecision());
            }

            if ('d' != currentConversionType
                    && formatToken.isFlagSet(FormatToken.FLAG_COMMA)) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), currentConversionType);
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)
                    && 'd' == currentConversionType) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), currentConversionType);
            }

            if (null == bigInt) {
                return transformFromNull();
            }

            isNegative = (bigInt.compareTo(BigInteger.ZERO) < 0);

            if ('d' == currentConversionType) {
                NumberFormat numberFormat = getNumberFormat();
                boolean readableName = formatToken
                        .isFlagSet(FormatToken.FLAG_COMMA);
                numberFormat.setGroupingUsed(readableName);
                result.append(numberFormat.format(bigInt));
            } else if ('o' == currentConversionType) {
                // convert BigInteger to a string presentation using radix 8
                result.append(bigInt.toString(8));
            } else {
                // convert BigInteger to a string presentation using radix 16
                result.append(bigInt.toString(16));
            }
            if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)) {
                startIndex = isNegative ? 1 : 0;
                if ('o' == currentConversionType) {
                    result.insert(startIndex, "0"); //$NON-NLS-1$
                    startIndex += 1;
                } else if ('x' == currentConversionType
                        || 'X' == currentConversionType) {
                    result.insert(startIndex, "0x"); //$NON-NLS-1$
                    startIndex += 2;
                }
            }

            if (!isNegative) {
                if (formatToken.isFlagSet(FormatToken.FLAG_ADD)) {
                    result.insert(0, '+');
                    startIndex += 1;
                }
                if (formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                    result.insert(0, ' ');
                    startIndex += 1;
                }
            }

            /* pad paddingChar to the output */
            if (isNegative
                    && formatToken.isFlagSet(FormatToken.FLAG_PARENTHESIS)) {
                result = wrapParentheses(result);
                return result.toString();

            }
            if (isNegative && formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                startIndex++;
            }
            return padding(result, startIndex);
        }

        /*
         * Transforms a Float,Double or BigDecimal to a formatted string.
         */
        private String transformFromFloat() {
            StringBuilder result = new StringBuilder();
            int startIndex = 0;
            char currentConversionType = formatToken.getConversionType();

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS
                    | FormatToken.FLAG_ZERO)) {
                if (!formatToken.isWidthSet()) {
                    throw new MissingFormatWidthException(formatToken
                            .getStrFlags());
                }
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_ADD)
                    && formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && formatToken.isFlagSet(FormatToken.FLAG_ZERO)) {
                throw new IllegalFormatFlagsException(formatToken.getStrFlags());
            }

            if ('e' == Character.toLowerCase(currentConversionType)) {
                if (formatToken.isFlagSet(FormatToken.FLAG_COMMA)) {
                    throw new FormatFlagsConversionMismatchException(
                            formatToken.getStrFlags(), currentConversionType);
                }
            }

            if ('g' == Character.toLowerCase(currentConversionType)) {
                if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)) {
                    throw new FormatFlagsConversionMismatchException(
                            formatToken.getStrFlags(), currentConversionType);
                }
            }

            if ('a' == Character.toLowerCase(currentConversionType)) {
                if (formatToken.isFlagSet(FormatToken.FLAG_COMMA)
                        || formatToken.isFlagSet(FormatToken.FLAG_PARENTHESIS)) {
                    throw new FormatFlagsConversionMismatchException(
                            formatToken.getStrFlags(), currentConversionType);
                }
            }

            if (null == arg) {
                return transformFromNull();
            }

            Object arg2 = arg;
            
            if (!(arg2 instanceof Float || arg2 instanceof Double || arg2 instanceof BigDecimal)) {
                if (arg2 instanceof Number) {
                    arg2 = Double.valueOf(((Number)arg2).doubleValue());
                }
                else {
                    throw new IllegalFormatConversionException(currentConversionType, arg.getClass());
                }
            }

            String specialNumberResult = transformFromSpecialNumber();
            if (null != specialNumberResult) {
                return specialNumberResult;
            }

            if ('a' != Character.toLowerCase(currentConversionType)) {
                formatToken
                        .setPrecision(formatToken.isPrecisionSet() ? formatToken
                                .getPrecision()
                                : FormatToken.DEFAULT_PRECISION);
            }
            // output result
            FloatUtil floatUtil = new FloatUtil(result, formatToken,
                    (DecimalFormat) NumberFormat.getInstance(locale), arg2);
            floatUtil.transform(formatToken, result);

            formatToken.setPrecision(FormatToken.UNSET);

            if (getDecimalFormatSymbols().getMinusSign() == result.charAt(0)) {
                if (formatToken.isFlagSet(FormatToken.FLAG_PARENTHESIS)) {
                    result = wrapParentheses(result);
                    return result.toString();
                }
            } else {
                if (formatToken.isFlagSet(FormatToken.FLAG_SPACE)) {
                    result.insert(0, ' ');
                    startIndex++;
                }
                if (formatToken.isFlagSet(FormatToken.FLAG_ADD)) {
                    result.insert(0, floatUtil.getAddSign());
                    startIndex++;
                }
            }

            char firstChar = result.charAt(0);
            if (formatToken.isFlagSet(FormatToken.FLAG_ZERO)
                    && (firstChar == floatUtil.getAddSign() || firstChar == floatUtil
                            .getMinusSign())) {
                startIndex = 1;
            }

            if ('a' == Character.toLowerCase(currentConversionType)) {
                startIndex += 2;
            }
            return padding(result, startIndex);
        }

        /*
         * Transforms a Date to a formatted string.
         */
        private String transformFromDateTime() {
            int startIndex = 0;
            char currentConversionType = formatToken.getConversionType();

            if (formatToken.isPrecisionSet()) {
                throw new IllegalFormatPrecisionException(formatToken
                        .getPrecision());
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)) {
                throw new FormatFlagsConversionMismatchException(formatToken
                        .getStrFlags(), currentConversionType);
            }

            if (formatToken.isFlagSet(FormatToken.FLAG_MINUS)
                    && FormatToken.UNSET == formatToken.getWidth()) {
                throw new MissingFormatWidthException("-" //$NON-NLS-1$
                        + currentConversionType);
            }

            if (null == arg) {
                return transformFromNull();
            }

            Calendar calendar;
            if (arg instanceof Calendar) {
                calendar = (Calendar) arg;
            } else {
                Date date = null;
                if (arg instanceof Number) {
                    date = new Date(((Number) arg).longValue());
                } else if (arg instanceof Date) {
                    date = (Date) arg;
                } else {
                    throw new IllegalFormatConversionException(
                            currentConversionType, arg.getClass());
                }
                calendar = Calendar.getInstance(locale);
                calendar.setTime(date);
            }

            if (null == dateTimeUtil) {
                dateTimeUtil = new DateTimeUtil(locale);
            }
            StringBuilder result = new StringBuilder();
            // output result
            dateTimeUtil.transform(formatToken, calendar, result);
            return padding(result, startIndex);
        }
    }

    private static class FloatUtil {
        private StringBuilder result;

        private DecimalFormat decimalFormat;

        private FormatToken formatToken;

        private Object argument;

        private char minusSign;

        FloatUtil(StringBuilder result, FormatToken formatToken,
                DecimalFormat decimalFormat, Object argument) {
            this.result = result;
            this.formatToken = formatToken;
            this.decimalFormat = decimalFormat;
            this.argument = argument;
            this.minusSign = decimalFormat.getDecimalFormatSymbols()
                    .getMinusSign();
        }

        void transform(FormatToken aFormatToken, StringBuilder aResult) {
            this.result = aResult;
            this.formatToken = aFormatToken;
            switch (formatToken.getConversionType()) {
                case 'e':
                case 'E': {
                    transform_e();
                    break;
                }
                case 'f': {
                    transform_f();
                    break;
                }
                case 'g':
                case 'G': {
                    transform_g();
                    break;
                }
                case 'a':
                case 'A': {
                    transform_a();
                    break;
                }
                default: {
                    throw new UnknownFormatConversionException(String
                            .valueOf(formatToken.getConversionType()));
                }
            }
        }

        char getMinusSign() {
            return minusSign;
        }

        char getAddSign() {
            return '+';
        }

        void transform_e() {
            StringBuilder pattern = new StringBuilder();
            pattern.append('0');
            if (formatToken.getPrecision() > 0) {
                pattern.append('.');
                char[] zeros = new char[formatToken.getPrecision()];
                Arrays.fill(zeros, '0');
                pattern.append(zeros);
            }
            pattern.append('E');
            pattern.append("+00"); //$NON-NLS-1$
            decimalFormat.applyPattern(pattern.toString());
            String formattedString = decimalFormat.format(argument);
            result.append(formattedString.replace('E', 'e'));

            // if the flag is sharp and decimal seperator is always given
            // out.
            if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)
                    && 0 == formatToken.getPrecision()) {
                int indexOfE = result.indexOf("e"); //$NON-NLS-1$
                char dot = decimalFormat.getDecimalFormatSymbols()
                        .getDecimalSeparator();
                result.insert(indexOfE, dot);
            }
        }

        void transform_g() {
            int precision = formatToken.getPrecision();
            precision = (0 == precision ? 1 : precision);
            formatToken.setPrecision(precision);

            if (0.0 == ((Number) argument).doubleValue()) {
                precision--;
                formatToken.setPrecision(precision);
                transform_f();
                return;
            }

            boolean requireScientificRepresentation = true;
            double d = ((Number) argument).doubleValue();
            d = Math.abs(d);
            if (Double.isInfinite(d)) {
                precision = formatToken.getPrecision();
                precision--;
                formatToken.setPrecision(precision);
                transform_e();
                return;
            }
            BigDecimal b = new BigDecimal(d, new MathContext(precision));
            d = b.doubleValue();
            long l = b.longValue();

            if (d >= 1 && d < Math.pow(10, precision)) {
                if (l < Math.pow(10, precision)) {
                    requireScientificRepresentation = false;
                    precision -= String.valueOf(l).length();
                    precision = precision < 0 ? 0 : precision;
                    l = Math.round(d * Math.pow(10, precision + 1));
                    if (String.valueOf(l).length() <= formatToken
                            .getPrecision()) {
                        precision++;
                    }
                    formatToken.setPrecision(precision);
                }

            } else {
                l = b.movePointRight(4).longValue();
                if (d >= Math.pow(10, -4) && d < 1) {
                    requireScientificRepresentation = false;
                    precision += 4 - String.valueOf(l).length();
                    l = b.movePointRight(precision + 1).longValue();
                    if (String.valueOf(l).length() <= formatToken
                            .getPrecision()) {
                        precision++;
                    }
                    l = b.movePointRight(precision).longValue();
                    if (l >= Math.pow(10, precision - 4)) {
                        formatToken.setPrecision(precision);
                    }
                }
            }
            if (requireScientificRepresentation) {
                precision = formatToken.getPrecision();
                precision--;
                formatToken.setPrecision(precision);
                transform_e();
            } else {
                transform_f();
            }

        }

        void transform_f() {
            StringBuilder pattern = new StringBuilder();
            if (formatToken.isFlagSet(FormatToken.FLAG_COMMA)) {
                pattern.append(',');
                int groupingSize = decimalFormat.getGroupingSize();
                if (groupingSize > 1) {
                    char[] sharps = new char[groupingSize - 1];
                    Arrays.fill(sharps, '#');
                    pattern.append(sharps);
                }
            }

            pattern.append(0);

            if (formatToken.getPrecision() > 0) {
                pattern.append('.');
                char[] zeros = new char[formatToken.getPrecision()];
                Arrays.fill(zeros, '0');
                pattern.append(zeros);
            }
            decimalFormat.applyPattern(pattern.toString());
            result.append(decimalFormat.format(argument));
            // if the flag is sharp and decimal seperator is always given
            // out.
            if (formatToken.isFlagSet(FormatToken.FLAG_SHARP)
                    && 0 == formatToken.getPrecision()) {
                char dot = decimalFormat.getDecimalFormatSymbols()
                        .getDecimalSeparator();
                result.append(dot);
            }

        }

        void transform_a() {
            char currentConversionType = formatToken.getConversionType();

            if (argument instanceof Float) {
                Float F = (Float) argument;
                result.append(Float.toHexString(F.floatValue()));

            } else if (argument instanceof Double) {
                Double D = (Double) argument;
                result.append(Double.toHexString(D.doubleValue()));
            } else {
                // BigInteger is not supported.
                throw new IllegalFormatConversionException(
                        currentConversionType, argument.getClass());
            }

            if (!formatToken.isPrecisionSet()) {
                return;
            }

            int precision = formatToken.getPrecision();
            precision = (0 == precision ? 1 : precision);
            int indexOfFirstFracitoanlDigit = result.indexOf(".") + 1; //$NON-NLS-1$
            int indexOfP = result.indexOf("p"); //$NON-NLS-1$
            int fractionalLength = indexOfP - indexOfFirstFracitoanlDigit;

            if (fractionalLength == precision) {
                return;
            }

            if (fractionalLength < precision) {
                char zeros[] = new char[precision - fractionalLength];
                Arrays.fill(zeros, '0');
                result.insert(indexOfP, zeros);
                return;
            }
            result.delete(indexOfFirstFracitoanlDigit + precision, indexOfP);
        }
    }

    private static class DateTimeUtil {
        private Calendar calendar;

        private Locale locale;

        private StringBuilder result;

        private DateFormatSymbols dateFormatSymbols;

        DateTimeUtil(Locale locale) {
            this.locale = locale;
        }

        void transform(FormatToken formatToken, Calendar aCalendar,
                StringBuilder aResult) {
            this.result = aResult;
            this.calendar = aCalendar;
            char suffix = formatToken.getDateSuffix();

            switch (suffix) {
                case 'H': {
                    transform_H();
                    break;
                }
                case 'I': {
                    transform_I();
                    break;
                }
                case 'M': {
                    transform_M();
                    break;
                }
                case 'S': {
                    transform_S();
                    break;
                }
                case 'L': {
                    transform_L();
                    break;
                }
                case 'N': {
                    transform_N();
                    break;
                }
                case 'k': {
                    transform_k();
                    break;
                }
                case 'l': {
                    transform_l();
                    break;
                }
                case 'p': {
                    transform_p(true);
                    break;
                }
                case 's': {
                    transform_s();
                    break;
                }
                case 'z': {
                    transform_z();
                    break;
                }
                case 'Z': {
                    transform_Z();
                    break;
                }
                case 'Q': {
                    transform_Q();
                    break;
                }
                case 'B': {
                    transform_B();
                    break;
                }
                case 'b':
                case 'h': {
                    transform_b();
                    break;
                }
                case 'A': {
                    transform_A();
                    break;
                }
                case 'a': {
                    transform_a();
                    break;
                }
                case 'C': {
                    transform_C();
                    break;
                }
                case 'Y': {
                    transform_Y();
                    break;
                }
                case 'y': {
                    transform_y();
                    break;
                }
                case 'j': {
                    transform_j();
                    break;
                }
                case 'm': {
                    transform_m();
                    break;
                }
                case 'd': {
                    transform_d();
                    break;
                }
                case 'e': {
                    transform_e();
                    break;
                }
                case 'R': {
                    transform_R();
                    break;
                }

                case 'T': {
                    transform_T();
                    break;
                }
                case 'r': {
                    transform_r();
                    break;
                }
                case 'D': {
                    transform_D();
                    break;
                }
                case 'F': {
                    transform_F();
                    break;
                }
                case 'c': {
                    transform_c();
                    break;
                }
                default: {
                    throw new UnknownFormatConversionException(String
                            .valueOf(formatToken.getConversionType())
                            + formatToken.getDateSuffix());
                }
            }
        }

        private void transform_e() {
            int day = calendar.get(Calendar.DAY_OF_MONTH);
            result.append(day);
        }

        private void transform_d() {
            int day = calendar.get(Calendar.DAY_OF_MONTH);
            result.append(paddingZeros(day, 2));
        }

        private void transform_m() {
            int month = calendar.get(Calendar.MONTH);
            // The returned month starts from zero, which needs to be
            // incremented by 1.
            month++;
            result.append(paddingZeros(month, 2));
        }

        private void transform_j() {
            int day = calendar.get(Calendar.DAY_OF_YEAR);
            result.append(paddingZeros(day, 3));
        }

        private void transform_y() {
            int year = calendar.get(Calendar.YEAR);
            year %= 100;
            result.append(paddingZeros(year, 2));
        }

        private void transform_Y() {
            int year = calendar.get(Calendar.YEAR);
            result.append(paddingZeros(year, 4));
        }

        private void transform_C() {
            int year = calendar.get(Calendar.YEAR);
            year /= 100;
            result.append(paddingZeros(year, 2));
        }

        private void transform_a() {
            int day = calendar.get(Calendar.DAY_OF_WEEK);
            result.append(getDateFormatSymbols().getShortWeekdays()[day]);
        }

        private void transform_A() {
            int day = calendar.get(Calendar.DAY_OF_WEEK);
            result.append(getDateFormatSymbols().getWeekdays()[day]);
        }

        private void transform_b() {
            int month = calendar.get(Calendar.MONTH);
            result.append(getDateFormatSymbols().getShortMonths()[month]);
        }

        private void transform_B() {
            int month = calendar.get(Calendar.MONTH);
            result.append(getDateFormatSymbols().getMonths()[month]);
        }

        private void transform_Q() {
            long milliSeconds = calendar.getTimeInMillis();
            result.append(milliSeconds);
        }

        private void transform_s() {
            long milliSeconds = calendar.getTimeInMillis();
            milliSeconds /= 1000;
            result.append(milliSeconds);
        }

        private void transform_Z() {
            TimeZone timeZone = calendar.getTimeZone();
            result.append(timeZone
                    .getDisplayName(
                            timeZone.inDaylightTime(calendar.getTime()),
                            TimeZone.SHORT, locale));
        }

        private void transform_z() {
            int zoneOffset = calendar.get(Calendar.ZONE_OFFSET);
            zoneOffset /= 3600000;
            zoneOffset *= 100;
            if (zoneOffset >= 0) {
                result.append('+');
            }
            result.append(paddingZeros(zoneOffset, 4));
        }

        private void transform_p(boolean isLowerCase) {
            int i = calendar.get(Calendar.AM_PM);
            String s = getDateFormatSymbols().getAmPmStrings()[i];
            if (isLowerCase) {
                s = s.toLowerCase(locale);
            }
            result.append(s);
        }

        private void transform_N() {
            // TODO System.nanoTime();
            long nanosecond = calendar.get(Calendar.MILLISECOND) * 1000000L;
            result.append(paddingZeros(nanosecond, 9));
        }

        private void transform_L() {
            int millisecond = calendar.get(Calendar.MILLISECOND);
            result.append(paddingZeros(millisecond, 3));
        }

        private void transform_S() {
            int second = calendar.get(Calendar.SECOND);
            result.append(paddingZeros(second, 2));
        }

        private void transform_M() {
            int minute = calendar.get(Calendar.MINUTE);
            result.append(paddingZeros(minute, 2));
        }

        private void transform_l() {
            int hour = calendar.get(Calendar.HOUR);
            if (0 == hour) {
                hour = 12;
            }
            result.append(hour);
        }

        private void transform_k() {
            int hour = calendar.get(Calendar.HOUR_OF_DAY);
            result.append(hour);
        }

        private void transform_I() {
            int hour = calendar.get(Calendar.HOUR);
            if (0 == hour) {
                hour = 12;
            }
            result.append(paddingZeros(hour, 2));
        }

        private void transform_H() {
            int hour = calendar.get(Calendar.HOUR_OF_DAY);
            result.append(paddingZeros(hour, 2));
        }

        private void transform_R() {
            transform_H();
            result.append(':');
            transform_M();
        }

        private void transform_T() {
            transform_H();
            result.append(':');
            transform_M();
            result.append(':');
            transform_S();
        }

        private void transform_r() {
            transform_I();
            result.append(':');
            transform_M();
            result.append(':');
            transform_S();
            result.append(' ');
            transform_p(false);
        }

        private void transform_D() {
            transform_m();
            result.append('/');
            transform_d();
            result.append('/');
            transform_y();
        }

        private void transform_F() {
            transform_Y();
            result.append('-');
            transform_m();
            result.append('-');
            transform_d();
        }

        private void transform_c() {
            transform_a();
            result.append(' ');
            transform_b();
            result.append(' ');
            transform_d();
            result.append(' ');
            transform_T();
            result.append(' ');
            transform_Z();
            result.append(' ');
            transform_Y();
        }

        private static String paddingZeros(long number, int length) {
            int len = length;
            StringBuilder result = new StringBuilder();
            result.append(number);
            int startIndex = 0;
            if (number < 0) {
                len++;
                startIndex = 1;
            }
            len -= result.length();
            if (len > 0) {
                char[] zeros = new char[len];
                Arrays.fill(zeros, '0');
                result.insert(startIndex, zeros);
            }
            return result.toString();
        }

        private DateFormatSymbols getDateFormatSymbols() {
            if (null == dateFormatSymbols) {
                dateFormatSymbols = new DateFormatSymbols(locale);
            }
            return dateFormatSymbols;
        }
    }

    private static class ParserStateMachine {

        private static final char EOS = (char) -1;

        private static final int EXIT_STATE = 0;

        private static final int ENTRY_STATE = 1;

        private static final int START_CONVERSION_STATE = 2;

        private static final int FLAGS_STATE = 3;

        private static final int WIDTH_STATE = 4;

        private static final int PRECISION_STATE = 5;

        private static final int CONVERSION_TYPE_STATE = 6;

        private static final int SUFFIX_STATE = 7;

        private FormatToken token;

        private int state = ENTRY_STATE;

        private char currentChar = 0;

        private CharBuffer format = null;

        ParserStateMachine(CharBuffer format) {
            this.format = format;
        }

        void reset() {
            this.currentChar = (char) FormatToken.UNSET;
            this.state = ENTRY_STATE;
            this.token = null;
        }

        /*
         * Gets the information about the current format token. Information is
         * recorded in the FormatToken returned and the position of the stream
         * for the format string will be advanced till the next format token.
         */
        FormatToken getNextFormatToken() {
            token = new FormatToken();
            token.setFormatStringStartIndex(format.position());

            // FINITE AUTOMATIC MACHINE
            while (true) {

                if (ParserStateMachine.EXIT_STATE != state) {
                    // exit state does not need to get next char
                    currentChar = getNextFormatChar();
                    if (EOS == currentChar
                            && ParserStateMachine.ENTRY_STATE != state) {
                        throw new UnknownFormatConversionException(
                                getFormatString());
                    }
                }

                switch (state) {
                    // exit state
                    case ParserStateMachine.EXIT_STATE: {
                        process_EXIT_STATE();
                        return token;
                    }
                        // plain text state, not yet applied converter
                    case ParserStateMachine.ENTRY_STATE: {
                        process_ENTRY_STATE();
                        break;
                    }
                        // begins converted string
                    case ParserStateMachine.START_CONVERSION_STATE: {
                        process_START_CONVERSION_STATE();
                        break;
                    }
                    case ParserStateMachine.FLAGS_STATE: {
                        process_FlAGS_STATE();
                        break;
                    }
                    case ParserStateMachine.WIDTH_STATE: {
                        process_WIDTH_STATE();
                        break;
                    }
                    case ParserStateMachine.PRECISION_STATE: {
                        process_PRECISION_STATE();
                        break;
                    }
                    case ParserStateMachine.CONVERSION_TYPE_STATE: {
                        process_CONVERSION_TYPE_STATE();
                        break;
                    }
                    case ParserStateMachine.SUFFIX_STATE: {
                        process_SUFFIX_STATE();
                        break;
                    }
                }
            }
        }

        /*
         * Gets next char from the format string.
         */
        private char getNextFormatChar() {
            if (format.hasRemaining()) {
                return format.get();
            }
            return EOS;
        }

        private String getFormatString() {
            int end = format.position();
            format.rewind();
            String formatString = format.subSequence(
                    token.getFormatStringStartIndex(), end).toString();
            format.position(end);
            return formatString;
        }

        private void process_ENTRY_STATE() {
            if (EOS == currentChar) {
                state = ParserStateMachine.EXIT_STATE;
            } else if ('%' == currentChar) {
                // change to conversion type state
                state = START_CONVERSION_STATE;
            }
            // else remains in ENTRY_STATE
        }

        private void process_START_CONVERSION_STATE() {
            if (Character.isDigit(currentChar)) {
                int position = format.position() - 1;
                int number = parseInt(format);
                char nextChar = 0;
                if (format.hasRemaining()) {
                    nextChar = format.get();
                }
                if ('$' == nextChar) {
                    // the digital sequence stands for the argument
                    // index.
                    int argIndex = number;
                    // k$ stands for the argument whose index is k-1 except that
                    // 0$ and 1$ both stands for the first element.
                    if (argIndex > 0) {
                        token.setArgIndex(argIndex - 1);
                    } else if (argIndex == FormatToken.UNSET) {
                        throw new MissingFormatArgumentException(
                                getFormatString());
                    }
                    state = FLAGS_STATE;
                } else {
                    // the digital zero stands for one format flag.
                    if ('0' == currentChar) {
                        state = FLAGS_STATE;
                        format.position(position);
                    } else {
                        // the digital sequence stands for the width.
                        state = WIDTH_STATE;
                        // do not get the next char.
                        format.position(format.position() - 1);
                        token.setWidth(number);
                    }
                }
                currentChar = nextChar;
            } else if ('<' == currentChar) {
                state = FLAGS_STATE;
                token.setArgIndex(FormatToken.LAST_ARGUMENT_INDEX);
            } else {
                state = FLAGS_STATE;
                // do not get the next char.
                format.position(format.position() - 1);
            }

        }

        private void process_FlAGS_STATE() {
            if (token.setFlag(currentChar)) {
                // remains in FLAGS_STATE
            } else if (Character.isDigit(currentChar)) {
                token.setWidth(parseInt(format));
                state = WIDTH_STATE;
            } else if ('.' == currentChar) {
                state = PRECISION_STATE;
            } else {
                state = CONVERSION_TYPE_STATE;
                // do not get the next char.
                format.position(format.position() - 1);
            }
        }

        private void process_WIDTH_STATE() {
            if ('.' == currentChar) {
                state = PRECISION_STATE;
            } else {
                state = CONVERSION_TYPE_STATE;
                // do not get the next char.
                format.position(format.position() - 1);
            }
        }

        private void process_PRECISION_STATE() {
            if (Character.isDigit(currentChar)) {
                token.setPrecision(parseInt(format));
            } else {
                // the precision is required but not given by the
                // format string.
                throw new UnknownFormatConversionException(getFormatString());
            }
            state = CONVERSION_TYPE_STATE;
        }

        private void process_CONVERSION_TYPE_STATE() {
            token.setConversionType(currentChar);
            if ('t' == currentChar || 'T' == currentChar) {
                state = SUFFIX_STATE;
            } else {
                state = EXIT_STATE;
            }

        }

        private void process_SUFFIX_STATE() {
            token.setDateSuffix(currentChar);
            state = EXIT_STATE;
        }

        private void process_EXIT_STATE() {
            token.setPlainText(getFormatString());
        }

        /*
         * Parses integer value from the given buffer
         */
        private int parseInt(CharBuffer buffer) {
            int start = buffer.position() - 1;
            int end = buffer.limit();
            while (buffer.hasRemaining()) {
                if (!Character.isDigit(buffer.get())) {
                    end = buffer.position() - 1;
                    break;
                }
            }
            buffer.position(0);
            String intStr = buffer.subSequence(start, end).toString();
            buffer.position(end);
            try {
                return Integer.parseInt(intStr);
            } catch (NumberFormatException e) {
                return FormatToken.UNSET;
            }
        }
    }
}
