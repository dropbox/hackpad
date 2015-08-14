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

package net.appjet.oui;

import scala.collection.mutable.ArrayBuffer;

import javax.crypto.Cipher;
import java.security._;
import java.security.spec._;
import java.math.BigInteger;
import java.io.{ObjectInputStream, ObjectOutputStream, FileInputStream, FileOutputStream, PrintWriter, OutputStreamWriter, ByteArrayOutputStream, ByteArrayInputStream, InputStream, InputStreamReader, BufferedReader, DataOutputStream, DataInputStream};

import net.appjet.common.util.BetterFile;

// object EncryptomaticTest {
//   def main(args: Array[String]) {
//     args(0) match {
//       case "genkeys" => {
// 	val keyPair = Encryptomatic.generateKeyPair;
// 	println("made key pair.")
// 	Encryptomatic.writeKeyPair(keyPair, args(1), args(2));
// 	println("done.");
//       }
//       case "printkeys" => {
// 	val keyPair = Encryptomatic.generateKeyPair;
// 	val Pair(pubBytes, privBytes) = Encryptomatic.keyPairBytes(keyPair);
// 	println("Public key: "+Encryptomatic.bytesToAscii(pubBytes))
// 	println("Private key: "+Encryptomatic.bytesToAscii(privBytes));
//       }
//       case "sign" => {
// 	println(Encryptomatic.sign(java.lang.System.in, Encryptomatic.readPrivateKey(new FileInputStream(args(1)))));
//       }
//       case "verify" => {
// 	if (Encryptomatic.verify(java.lang.System.in, Encryptomatic.readPublicKey(new FileInputStream(args(1))), args(2))) {
// 	  println("Verification succeeded.");
// 	} else {
// 	  println("Verification failed.");
// 	}
//       }
//       case "test" => {
// 	val out = new PrintWriter(new OutputStreamWriter(System.out, "UTF-8"), true);
// 	val src = "Hey dudes, this is a test of この魚は築地からのですか？";
// 	out.println(src);
// 	val bytes = Encryptomatic.bytesToAscii(src.getBytes("UTF-8"));
// 	out.println("bytes: "+bytes);
// 	val done = new String(Encryptomatic.asciiToBytes(bytes), "UTF-8");
// 	out.println(done);
// 	out.println("Match? "+(done == src));
//       }
//       case "keytest" => {
// 	val keyPair = Encryptomatic.generateKeyPair;
// 	val bytes = Encryptomatic.keyPairBytes(keyPair);
// 	try { 
// 	  val newKeyPair = Encryptomatic.readKeyPair(new ByteArrayInputStream(Encryptomatic.bytesToAscii(bytes._1).getBytes()),
// 						     new ByteArrayInputStream(Encryptomatic.bytesToAscii(bytes._2).getBytes()));
// 	  println("equal? "+(keyPair.getPublic.getEncoded.deepEquals(newKeyPair.getPublic.getEncoded) && keyPair.getPrivate.getEncoded.deepEquals(newKeyPair.getPrivate.getEncoded)));
// 	} catch {
// 	  case e: InvalidKeySpecException => {
// 	    println("equality failed.")
// 	    println("public key 1 is: "+bytes._1.mkString("(", ",", ")"));
// 	    println("public key 2 is: "+BetterFile.getStreamBytes(new Encryptomatic.AsciiToBytesInputStream(new ByteArrayInputStream(Encryptomatic.bytesToAscii(bytes._1).getBytes()))).mkString("(", ",", ")"));
// 	    println("pk1 enc to: "+Encryptomatic.bytesToAscii(bytes._1));
// 	  }
// 	}
//       }
//     }
//   }
// }

object Encryptomatic {
  private val chars = "0123456789abcdefghijlkmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  def bytesToAscii(bytes: Array[Byte]) = {
    var i = BigInt(bytes);
    val neg = i < 0;
    if (neg)
      i = BigInt(0)-i;
    val sb = new StringBuffer();
    while (i > BigInt(chars.length-1)) {
      val Pair(div, mod) = i /% BigInt(chars.length);
      sb.append(chars(mod.intValue));
      i = div;
    }
    sb.append(chars(i.intValue));
    (if (neg) "-" else "")+sb.toString.reverse;
  }
  def asciiToBytes(src: String) = {
    var i = BigInt(0);
    val Pair(isNegative, b) = 
      if (src.startsWith("-"))
	(true, src.substring(1))
      else
	(false, src);
    for (c <- b) {
      i = i * chars.length + chars.indexOf(c);
    }
    if (isNegative)
      i = BigInt(0)-i;
    i.toByteArray
  }

  def generateKeyPair(keyType: String) = {
    val keyGen = KeyPairGenerator.getInstance(keyType);
    val random = SecureRandom.getInstance("SHA1PRNG", "SUN");
    keyGen.initialize(1024, random);
    keyGen.generateKeyPair();
  }

  def keyPairBytes(keyPair: KeyPair) = {
    val pubKey = keyPair.getPublic();
    if (pubKey.getFormat != "X.509")
      throw new RuntimeException("Can't produce public key in format: "+pubKey.getFormat);

    val privKey = keyPair.getPrivate();
    if (privKey.getFormat != "PKCS#8")
      throw new RuntimeException("Can't produce private key in format: "+privKey.getFormat);

    (pubKey.getEncoded, privKey.getEncoded)
  }

  def writeKeyPair(keyPair: KeyPair, publicKey: String, privateKey: String) {
    val pubOutputStream = new PrintWriter(new FileOutputStream(publicKey));
    val privOutputStream = new PrintWriter(new FileOutputStream(privateKey));
    val Pair(pubBytes, privBytes) = keyPairBytes(keyPair);
    pubOutputStream.print(bytesToAscii(pubBytes));
    privOutputStream.print(bytesToAscii(privBytes));
    List(pubOutputStream, privOutputStream).foreach(x => {x.flush(); x.close()});
  }

  class AsciiToBytesInputStream(in: InputStream) extends InputStream {
    val reader = new BufferedReader(new InputStreamReader(in));
    val bytes = new ByteArrayInputStream(asciiToBytes(reader.readLine()));
    def read(): Int = bytes.read();
  }
  
  def readPublicKey(keyType: String, publicKey: InputStream) = {
    val pubKeySpec = new X509EncodedKeySpec(BetterFile.getStreamBytes(new AsciiToBytesInputStream(publicKey)));
    KeyFactory.getInstance(keyType).generatePublic(pubKeySpec);
  }
  def readPrivateKey(keyType: String, privateKey: InputStream) = {
    val privKeySpec = new PKCS8EncodedKeySpec(BetterFile.getStreamBytes(new AsciiToBytesInputStream(privateKey)));    
    KeyFactory.getInstance(keyType).generatePrivate(privKeySpec);
  }

  def readKeyPair(keyType: String, publicKey: InputStream, privateKey: InputStream) = {
    new KeyPair(readPublicKey(keyType, publicKey),
		readPrivateKey(keyType, privateKey));
  }  

  def sign(source: InputStream, key: PrivateKey): Array[Byte] = {
    val dsa = Signature.getInstance("SHA1withDSA");
    dsa.initSign(key);
    val inBytes = new Array[Byte](4096);
    var count = source.read(inBytes);
    while (count > 0) {
      dsa.update(inBytes, 0, count);
      count = source.read(inBytes);
    }
    dsa.sign();
  }

  def verify(source: InputStream, key: PublicKey, sig: Array[Byte]): Boolean = {
    val dsa = Signature.getInstance("SHA1withDSA");
    dsa.initVerify(key);
    val inBytes = new Array[Byte](4096);
    var count = source.read(inBytes);
    while (count > 0) {
      dsa.update(inBytes, 0, count);
      count = source.read(inBytes);
    }
    dsa.verify(sig)
  }
  
  def encrypt(source: InputStream, key: PublicKey): Array[Byte] = {
    val cipher = Cipher.getInstance("RSA");
    cipher.init(Cipher.ENCRYPT_MODE, key);
    val inBytes = new Array[Byte](100);
    val outBytesStream = new ByteArrayOutputStream();
    val dataOut = new DataOutputStream(outBytesStream);

    var count = source.read(inBytes);
    while (count > 0) {
      val arr = cipher.doFinal(inBytes, 0, count);
      dataOut.writeShort(arr.length);
      dataOut.write(arr, 0, arr.length);
      count = source.read(inBytes);
    }
    dataOut.writeShort(0);
    outBytesStream.toByteArray();
  }
  
  def decrypt(source: InputStream, key: PrivateKey): Array[Byte] = {
    val in = new DataInputStream(source);
    def readBlock() = {
      val length = in.readShort();
      if (length > 0) {
        val bytes = new Array[Byte](length);
        in.readFully(bytes);
        Some(bytes);
      } else {
        None;
      }
    }
    val outBytes = new ArrayBuffer[Byte];
    val cipher = Cipher.getInstance("RSA");
    cipher.init(Cipher.DECRYPT_MODE, key);
    var block = readBlock();
    while (block.isDefined) {
      outBytes ++= cipher.doFinal(block.get);
      block = readBlock();
    }
    outBytes.toArray;
  }
}

object Encryptor {
  def main(args: Array[String]) {
    args(0) match {
      case "genkeys" => {
        println("generating keys...");
        val keyPair = Encryptomatic.generateKeyPair(args(1));
        println("saving public key to: "+args(2)+"; private key to: "+args(3));
        Encryptomatic.writeKeyPair(keyPair, args(2), args(3));
        println("done.");
      }
      case "test" => {
        val plaintext = "This is a test of some data that's actually pretty long once you really start thinking about it. I mean, it needs to be more than 117 bytes for it to be a reasonable test, and I suppose it's pretty close to that now. OK, let's just go for it and see what happens.".getBytes("UTF-8");
        val keys = Encryptomatic.generateKeyPair("RSA");
        val ciphertext = Encryptomatic.bytesToAscii(Encryptomatic.encrypt(new ByteArrayInputStream(plaintext), keys.getPublic()));
        println(ciphertext);
        println(new String(Encryptomatic.decrypt(new ByteArrayInputStream(Encryptomatic.asciiToBytes(ciphertext)), keys.getPrivate()), "UTF-8"));
      }
      case "decode" => {
        val key = Encryptomatic.readPrivateKey(args(1), new FileInputStream(args(2)));
        val plaintext = Encryptomatic.decrypt(new ByteArrayInputStream(Encryptomatic.asciiToBytes(args(3))), key);
        println(new String(plaintext, "UTF-8"));
      }
      case "decodeFile" => {
        println("Enter private key (assuming type RSA):");
        val key = Encryptomatic.readPrivateKey("RSA", java.lang.System.in);
        val file = new java.io.File(args(1));
        println("Reading "+file.getName()+"...");
        val reader = new java.io.BufferedReader(new java.io.InputStreamReader(new FileInputStream(file)));
        var line = reader.readLine();
        while (line != null) {
          val bytes = Encryptomatic.decrypt(new ByteArrayInputStream(Encryptomatic.asciiToBytes(line)), key);
          println(new String(bytes, "UTF-8"));
          line = reader.readLine();
        }
      }
    }
  }
}
