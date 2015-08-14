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

import java.io.*;
import java.util.*;
import java.lang.reflect.*;

public class ClassReload {

    /**
     * To use:  Optionally call initCompilerArgs, just like command-line
     * starting after "scalac" or "fsc", do not use "-d", you may
     * want to use "-classpath"/"-cp", no source files.  Then call
     * compile(...).  Then load classes.  isUpToDate() will tell you
     * if source files have changed since compilation.  If you want
     * to compile again, use recompile() to create a new class-loader so that
     * you can have new versions of existing classes.  The class-loader
     * behavior is to load classes that were generated during compilation
     * using the output of compilation, and delegate all other classes to
     * the parent loader.
     */
    public static class ScalaSourceClassLoader extends ClassLoader {
	public ScalaSourceClassLoader(ClassLoader parent) {
	    super(parent);
	}
	public ScalaSourceClassLoader() {
	    this(ScalaSourceClassLoader.class.getClassLoader());
	}

	private List<String> compilerArgs = Collections.emptyList();
	private List<String> sourceFileList = Collections.emptyList();

	private Map<File,Long> sourceFileMap = new HashMap<File,Long>();
	private Map<String,byte[]> outputFileMap = new HashMap<String,byte[]>();

	private boolean successfulCompile = false;
	
	public void initCompilerArgs(String... args) {
	    compilerArgs = new ArrayList<String>();
	    for(String a : args) compilerArgs.add(a);
	}

	public boolean compile(String... sourceFiles) {
	    sourceFileList = new ArrayList<String>();
	    for(String a : sourceFiles) sourceFileList.add(a);
	    
	    sourceFileMap.clear();
	    outputFileMap.clear();
	    
	    File tempDir = makeTemporaryDir();
	    try {
		List<String> argsToPass = new ArrayList<String>();
		argsToPass.add("-d");
		argsToPass.add(tempDir.getAbsolutePath());
		argsToPass.addAll(compilerArgs);
		for(String sf : sourceFileList) {
		    File f = new File(sf).getAbsoluteFile();
		    sourceFileMap.put(f, f.lastModified());
		    argsToPass.add(f.getPath());
		}
		String[] argsToPassArray = argsToPass.toArray(new String[0]);
		
		int compileResult = invokeFSC(argsToPassArray);
		
		if (compileResult != 0) {
		    successfulCompile = false;
		    return false;
		}
		
		for(String outputFile : listRecursive(tempDir)) {
		    outputFileMap.put(outputFile,
				      getFileBytes(new File(tempDir, outputFile)));
		}
		
		successfulCompile = true;
		return true;
	    }
	    finally {
		deleteRecursive(tempDir);
	    }
	}

	public ScalaSourceClassLoader recompile() {
	    ScalaSourceClassLoader sscl = new ScalaSourceClassLoader(getParent());
	    sscl.initCompilerArgs(compilerArgs.toArray(new String[0]));
	    sscl.compile(sourceFileList.toArray(new String[0]));
	    return sscl;
	}

	public boolean isSuccessfulCompile() {
	    return successfulCompile;
	}
	
	public boolean isUpToDate() {
	    for(Map.Entry<File,Long> entry : sourceFileMap.entrySet()) {
		long mod = entry.getKey().lastModified();
		if (mod == 0 || mod > entry.getValue()) {
		    return false;
		}
	    }
	    return true;
	}
	
	@Override protected synchronized Class<?> loadClass(String name,
							    boolean resolve)
	    throws ClassNotFoundException {
	    
	    // Based on java.lang.ClassLoader.loadClass(String,boolean)
	    
	    // First, check if the class has already been loaded
	    Class<?> c = findLoadedClass(name);
	    if (c == null) {
		String fileName = name.replace('.','/')+".class";
		if (outputFileMap.containsKey(fileName)) {
		    // define it ourselves
		    byte b[] = outputFileMap.get(fileName);
		    c = defineClass(name, b, 0, b.length);
		}
	    }
	    if (c != null) {
		if (resolve) {
		    resolveClass(c);
		}
		return c;
	    }
	    else {
		// use super behavior
		return super.loadClass(name, resolve);
	    }
	}
    }
    
    private static byte[] readStreamFully(InputStream in) throws IOException {
	InputStream from = new BufferedInputStream(in);
	ByteArrayOutputStream to = new ByteArrayOutputStream(in.available());
	ferry(from, to);
	return to.toByteArray();
    }

    private static void ferry(InputStream from, OutputStream to)
	throws IOException {
	
	byte[] buf = new byte[1024];
	boolean done = false;
	while (! done) {
	    int numRead = from.read(buf);
	    if (numRead < 0) {
		done = true;
	    }
	    else {
		to.write(buf, 0, numRead);
	    }
	}
	from.close();
	to.close();	
    }

    private static Class<?> classForName(String name) {
	try {
	    return Class.forName(name);
	}
	catch (ClassNotFoundException e) {
	    throw new RuntimeException(e);
	}
    }

    static boolean deleteRecursive(File f) {
	if(f.exists()) {
	    File[] files = f.listFiles();
	    for(File g : files) {
		if(g.isDirectory()) {
		    deleteRecursive(g);
		}
		else {
		    g.delete();
		}
	    }
	}
	return f.delete();
    }

    static byte[] getFileBytes(File f) {
	try {
	    return readStreamFully(new FileInputStream(f));
	}
	catch (IOException e) {
	    throw new RuntimeException(e);
	}
    }

    static List<String> listRecursive(File dir) {
	List<String> L = new ArrayList<String>();
	listRecursive(dir, "", L);
	return L;
    }
    
    static void listRecursive(File dir, String prefix, Collection<String> drop) {
	for(File f : dir.listFiles()) {
	    if (f.isDirectory()) {
		listRecursive(f, prefix + f.getName() + "/", drop);
	    }
	    else {
		drop.add(prefix + f.getName());
	    }
	}
    }
    
    static File makeTemporaryDir() {
	try {
	    File f = File.createTempFile("ajclsreload", "").getAbsoluteFile();
	    if (! f.delete())
		throw new RuntimeException("error creating temp dir");
	    if (! f.mkdir())
		throw new RuntimeException("error creating temp dir");
	    return f;
	}
	catch (IOException e) {
	    throw new RuntimeException("error creating temp dir");	    
	}
    }

    private static int invokeFSC(String[] args) {
	try {
	    Class<?> fsc =
		Class.forName("scala.tools.nsc.StandardCompileClient");
	    Object compiler = fsc.newInstance();
	    Method main0Method = fsc.getMethod("main0", String[].class);
	    return (Integer)main0Method.invoke(compiler, (Object)args);
	}
	catch (ClassNotFoundException e) { throw new RuntimeException(e); }
	catch (InstantiationException e) { throw new RuntimeException(e); }
	catch (NoSuchMethodException e) { throw new RuntimeException(e); }
	catch (IllegalAccessException e) { throw new RuntimeException(e); }
	catch (InvocationTargetException e) {
	    Throwable origThrowable = e.getCause();
	    if (origThrowable == null) throw new RuntimeException(e);
	    else if (origThrowable instanceof Error) {
		throw (Error)origThrowable;
	    }
	    else if (origThrowable instanceof RuntimeException) {
		throw (RuntimeException)origThrowable;
	    }
	    else {
		throw new RuntimeException(origThrowable);
	    }
	}
    }
}