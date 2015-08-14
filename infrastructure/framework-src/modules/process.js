/**
 * Simple way to execute external commands through javascript
 *
 * @example
 cmd = exec("cat");
 System.out.println("First: " +cmd.write("this is a loop.").read(Process.READ_AVAILABLE)); // prints "this is a loop."
 System.out.println("Second: " +cmd.writeAndClose(" hi there").result()); // prints "this is a loop. hi there"
 * 
 */

jimport("java.lang.Runtime");
jimport("java.io.BufferedInputStream");
jimport("java.io.BufferedOutputStream");
jimport("java.lang.System");

/* returns a process */
function exec(process) {
  return new Process(process);
};

function Process(cmd) {
  this.cmd = cmd;
  this.proc = Runtime.getRuntime().exec(cmd);
  this.resultText = "";
  this.inputStream = new BufferedInputStream(this.proc.getInputStream());
  this.errorStream = new BufferedInputStream(this.proc.getErrorStream());
  this.outputStream = new BufferedOutputStream(this.proc.getOutputStream());
}

Process.CHUNK_SIZE = 1024;
Process.READ_ALL = -1;
Process.READ_AVAILABLE = -2;

Process.prototype.write = function(stdinText) {
  this.outputStream.write(new java.lang.String(stdinText).getBytes());
  this.outputStream.flush();
  return this;
};

Process.prototype.writeAndClose = function(stdinText) {
  this.write(stdinText);
  this.outputStream.close();
  return this;
};

/* Python file-like behavior: read specified number of bytes, else until EOF*/
Process.prototype.read = function(nbytesToRead, stream) {
  var inputStream = stream || this.inputStream;
  var availBytes = inputStream.available();
  if (!availBytes) return null;
  
  var result = "";
  var nbytes = nbytesToRead || Process.READ_ALL;
  var readAll = (nbytes == Process.READ_ALL);
  var readAvailable = (nbytes == Process.READ_AVAILABLE);
  while (nbytes > 0 || readAll || readAvailable) {
    var chunkSize = readAll ? Process.CHUNK_SIZE :
              readAvailable ? Process.CHUNK_SIZE : nbytes;

    // allocate a java byte array
    var bytes = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, chunkSize);

    var len = inputStream.read(bytes, 0, chunkSize);
    
    // at end of stream, or when we run out of data, stop reading in chunks.
    if (len == -1) break;
    if (nbytes > 0) nbytes -= len;
    
    result += new java.lang.String(bytes);
    
    if (readAvailable && inputStream.available() == 0) break;
  }
  
  this.resultText += new String(result);
  return new String(result);
};

Process.prototype.result = function() {
  this.outputStream.close();
  this.proc.waitFor();
  this.read(Process.READ_ALL, this.inputStream);
  return new String(this.resultText);
};

Process.prototype.resultOrError = function() {
  this.proc.waitFor();
  this.read(Process.READ_ALL, this.inputStream);
  var result = this.resultText;
  if(!result || result == "") result = this.read(Process.READ_ALL, this.errorStream);
  return result || "";
};
