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

import net.appjet.bodylock.{BodyLock, Executable};
import net.appjet.common.util.BetterFile;

import java.io.{File, FileNotFoundException, FileInputStream, IOException, ByteArrayInputStream};
import java.util.concurrent.ConcurrentHashMap;
import java.util.WeakHashMap;

import scala.collection.mutable.Subscriber;
import scala.collection.script.{Message, Reset=>SReset};
import scala.collection.JavaConversions._;

trait WeakPublisher[A, This <: WeakPublisher[A, This]] { self: This => 
  val subscribers = new WeakHashMap[Subscriber[A, This], Unit];
  
  protected def publish(event: A): Unit = {
    subscribers.synchronized {
      val subsCopy = for (sub <- subscribers.keySet()) yield sub;
      for (sub <- subsCopy) {
        sub.notify(this, event);
      }
    }
  }
  
  def subscribe(sub: Subscriber[A, This]): Unit = {
    subscribers.synchronized {
      subscribers.put(sub, ());
    }
  }
  
  def removeSubscription(sub: Subscriber[A, This]): Unit = {
    subscribers.synchronized {
      subscribers.remove(sub);
    }
  }
}

object Reset extends SReset[Unit];

object FileCache {
  val files = new ConcurrentHashMap[String, CachedFile];
  
  def file(path: String): CachedFile = {
    if (files.containsKey(path)) {
      files.get(path);
    } else {
      val f = new CachedFile(new File(path));
      val oldFile = files.putIfAbsent(path, f);
      if (oldFile != null) {
        oldFile
      } else {
        f
      }
    }
  }
  
  def file(path: String, subscriber: Subscriber[Message[Unit], CachedFile]): CachedFile = {
    val f = file(path);
    f.subscribe(subscriber);
    f;
  }
  
  def testFiles() = {
    val iter = files.values().iterator();
    var filesHaveChanged = false;
    while (iter.hasNext()) {
      if (iter.next().test()) {
        filesHaveChanged = true;
      }
    }
    filesHaveChanged;
  }
}

class CachedFile(f: File) extends WeakPublisher[Message[Unit], CachedFile] {
  var cachedContent: Option[Array[Byte]] = None;
  def content = synchronized { 
    if (cachedContent.isEmpty) {
      cachedContent = Some(BetterFile.getFileBytes(f));
    }
    cachedContent.get;
  }
  def stream = new ByteArrayInputStream(content);

  var cachedExistence: Option[Boolean] = None;
  def exists = synchronized {
    if (cachedExistence.isEmpty) {
      cachedExistence = Some(f.exists());
    }
    cachedExistence.get;
  }
  
  var cachedDirectory: Option[Boolean] = None;
  def isDirectory = synchronized {
    if (cachedDirectory.isEmpty) {
      cachedDirectory = Some(f.isDirectory());
    }
    cachedDirectory.get;
  }

  def underlyingLastModified = f.lastModified;
  var lastModified = underlyingLastModified;
    
  def hasBeenModified = underlyingLastModified != lastModified;
  
  def test() = synchronized {
    if (hasBeenModified) {
      reset;
      true;
    } else {
      false;
    }
  }
  
  def reset = synchronized {
    lastModified = underlyingLastModified;
    cachedContent = None;
    cachedExistence = None;
    cachedDirectory = None;
    publish(Reset);
  }
}

class SpecialJarOrNotFile(root: String, fname: String) extends JarOrNotFile(root, fname) {
  override val classBase = "/net/appjet/ajstdlib/";
  override val fileSep = "/../";

  override def clone(fname: String) = new SpecialJarOrNotFile(root, fname);
}

// A JarOrNotFile that reads from the /mirror directory in the classpath.
class MirroredJarOrNotFile(root: String, fname: String) extends JarOrNotFile(root, fname) {
  override val classBase = "/mirror/";
  override def clone(fname: String) = new MirroredJarOrNotFile(root, fname);
}

class JarVirtualFile(fname: String) extends MirroredJarOrNotFile(config.useVirtualFileRoot, fname);

class JarOrNotFile(root: String, fname: String) extends Subscriber[Message[Unit], CachedFile] with WeakPublisher[Message[Unit], JarOrNotFile] {
  val classBase = "/net/appjet/ajstdlib/modules/";
  val fileSep = "/";
  val isJar = (root == null);
  val streamBase = if (isJar) getClass().getResource((classBase+fname).replaceAll("/+", "/")) else null;
  lazy val file = if (! isJar) FileCache.file(root+fileSep+fname, this) else null;

  def openStream() = {
    if (isJar) streamBase.openStream;
    else file.stream;
  }

  def exists = {
    if (isJar) streamBase != null;
    else file.exists;
  }

  def isDirectory = if (isJar) false else file.isDirectory;

  lazy val streamModified = streamBase.openConnection().getLastModified();
  def lastModified = {
    if (isJar) streamModified;
    else file.lastModified;
  }

  def name = fname;

  override def toString() = 
    getClass.getName+": "+hashCode()+"; fname: "+fname+"; streambase: "+streamBase+"; file: "+file+(if (isJar) " from: "+classBase+fname else "");
//   override def equals(o: AnyRef) =
//     o match {
//       case jf: JarOrNotFile => {
//         classBase == jf.classBase &&
//         fileSep == jf.fileSep &&
//         root == jf.root &&
//         fname == jf.fname
//       }
//       case _ => false
//     }
//   override def hashCode() =
//     classBase.hashCode + fileSep.hashCode + root.hashCode + fname.hashCode

  def notify(pub: CachedFile, event: Message[Unit]) = synchronized {
    publish(event);
  }

  def clone(fname: String) = new JarOrNotFile(root, fname);
}

abstract class AutoUpdateFile(val fname: String) extends Subscriber[Message[Unit], JarOrNotFile] {
  def files: Array[JarOrNotFile]; // = config.moduleRoots.map(f => new JarOrNotFile(f, libName));

  def exists = files.exists(_.exists);
  def file = files.find(_.exists).getOrElse(null);
  def fileLastModified = if (exists) file.lastModified else 0L;

  // var lastModified = fileLastModified;
  // var cachedContents: Option[String] = None;

  def fail(): Nothing = {
    throw new FileNotFoundException("No such module: "+fname);
  }

  // def hasBeenModified = {
  //   if (exists) {
  //     val newModTime = try {
  //       fileLastModified
  //     } catch {
  //       case e: NoSuchElementException => fail();
  //       case e: NullPointerException => fail();
  //     }
  //     newModTime > lastModified;
  //   } else {
  //     false;
  //   }
  // }

  // def update() = synchronized {
  //   try {
  //     lastModified = fileLastModified;
  //     val contents = BetterFile.getStreamContents(file.openStream()).replace("\r\n", "\n").replace("\r", "\n");
  //     if (contents == null) {
  //       fail();
  //     }
  //     cachedContents = Some(contents);
  //   } catch {
  //     case e: IOException => {
  //       exceptionlog(e);
  //       e.printStackTrace();
  //       fail();
  //     }
  //   }
  // }
  
  def notify(pub: JarOrNotFile, event: Message[Unit]) {
    event match {
      case Reset => cachedContents = None;
    }
  }
  
  var cachedContents: Option[String] = None;
  def update() = synchronized {
    if (cachedContents.isEmpty) {
      cachedContents = Some(BetterFile.getStreamContents(file.openStream()).replace("\r\n", "\n").replace("\r", "\n"));
    }
  }
  
  def contents = synchronized {
    update();
    cachedContents.get;
  }
  
  override def toString() = "[AutoUpdateFile: "+fname+"]";
}

class FixedDiskResource(srcfile: JarOrNotFile) extends AutoUpdateFile(srcfile.name) {
  lazy val files0 = Array(srcfile);
  files0.foreach(_.subscribe(this));
  
  override def files = files0;
}

abstract class DiskLibrary(fname: String) extends AutoUpdateFile(fname) {
  var cachedExecutable: Option[Executable] = None;

  lazy val classFiles = files.map({ f => 
    val parts = f.name.split("/");
    val pathIfAny = parts.reverse.drop(1).reverse.mkString("/");
    val newFname = 
      if (pathIfAny == "")
        className(f.name);
      else
        pathIfAny+"/"+className(parts.last);
    val newFile = f.clone(newFname+".class");
    newFile.subscribe(this);
    newFile;
  });
  def className(fname: String): String = "JS$"+fname.split("\\.").reverse.drop(1).reverse.mkString(".").replaceAll("[^A-Za-z0-9]", "\\$");
  def className: String = classFile.name.split("\\.").reverse.drop(1).reverse.mkString(".");
  
  override def exists = super.exists || classFiles.exists(_.exists);
  override def file = if (super.exists) super.file else classFile;
  def classFile = classFiles.find(_.exists).getOrElse(null);

//  println("Made DiskLibrary on "+fname+", with classFile: "+classFile);

  def updateExecutable() = synchronized {
    if (classFile == null)
      super.update();
    if (cachedExecutable.isEmpty) {
      try {
        if (classFile != null) {
          cachedExecutable = Some(BodyLock.executableFromBytes(BetterFile.getStreamBytes(classFile.openStream()), className.split("/").last));
        } else {
          cachedExecutable = Some(BodyLock.compileString(contents, "module "+fname, 1));
        }
      } catch {
        case e => { cachedExecutable = None; throw e; }
      }      
    }
  }

  def executable = synchronized {
    updateExecutable();
    cachedExecutable.get
  }

  override def notify(pub: JarOrNotFile, event: Message[Unit]) = synchronized {
    super.notify(pub, event);
    event match {
      case Reset => cachedExecutable = None;
    }
  }

  override def equals(o: Any) = 
    o match {
      case dl: DiskLibrary => {
        getClass.getName == dl.getClass.getName &&
        fname == dl.fname
      }
      case _ => false;
    }
  override def hashCode() =
    getClass.getName.hashCode + fname.hashCode
}

class FixedDiskLibrary(srcfile: JarOrNotFile) extends DiskLibrary(srcfile.name) {
  lazy val files0 = Array(srcfile);
  files0.foreach(_.subscribe(this));

  override def files = files0;
}

class VariableDiskLibrary(libName: String) extends DiskLibrary(libName) {
  lazy val files0 = 
    Array(new MirroredJarOrNotFile(null, libName)) ++ 
                 config.moduleRoots.map(f => new JarOrNotFile(f, libName))
  files0.foreach(_.subscribe(this));

  override def files = files0;
}
