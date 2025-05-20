import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid'; // For generating unique file names

/**
 * Interface for the result of code execution.
 */
export interface CodeExecutionResult {
    stdout: string;
    stderr: string;
    error: string | null;
    command: string; // The command that was executed
}

/**
 * Runs code in a specified language using local executables.
 * This function saves the code to a temporary file, executes it using the appropriate
 * language runtime/compiler, captures its output, and then cleans up the temporary files.
 *
 * @param {string} language The programming language (e.g., 'javascript', 'python', 'go', 'java').
 * @param {string} code The source code to execute.
 * @returns {Promise<CodeExecutionResult>} A promise that resolves with the stdout, stderr, and any execution error.
 */
export async function runCode(language: string, code: string): Promise<CodeExecutionResult> {
    // Define a temporary directory for code files.
    // Using `os.tmpdir()` is generally safer for system-wide temporary files,
    // but for a Raycast extension, a dedicated subdirectory within the extension's
    // temporary space (or even `__dirname` if careful) is often sufficient.
    // For simplicity, we'll use a `temp` directory relative to the compiled output.
    const tempDir = path.join(__dirname, '..', '..', 'temp'); // Go up two levels from dist/utils to extension root, then into temp
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true }); // Create temp directory if it doesn't exist, including parents
    }

    const uniqueId = uuidv4(); // Generate a unique ID for temporary files

    let filePath: string;
    let rawCommand: string; // The command specific to the language, before shell wrapping
    let cleanupFiles: string[] = []; // Files to clean up
    let executableCommand: string; // The actual command that will be checked for 'command not found'

    switch (language.toLowerCase()) {
        case 'javascript':
            filePath = path.join(tempDir, `${uniqueId}.js`);
            rawCommand = `node ${filePath}`;
            cleanupFiles.push(filePath);
            executableCommand = 'node';
            break;
        case 'python':
            filePath = path.join(tempDir, `${uniqueId}.py`);
            rawCommand = `python3 ${filePath}`; // Use python3 for modern systems
            cleanupFiles.push(filePath);
            executableCommand = 'python3';
            break;
        case 'go':
            filePath = path.join(tempDir, `${uniqueId}.go`);
            // Go programs are typically built first, then executed.
            // This ensures a proper executable is created and run.
            const goExecPath = path.join(tempDir, uniqueId); // Output executable name
            rawCommand = `go build -o ${goExecPath} ${filePath} && ${goExecPath}`;
            cleanupFiles.push(filePath, goExecPath);
            executableCommand = 'go';
            break;
        case 'java':
            // For Java, we need to find the public class name to execute it.
            // This regex is a simple approach; more robust parsing might be needed for complex cases.
            const classNameMatch = code.match(/public\s+class\s+([a-zA-Z0-9_]+)/);
            if (!classNameMatch || !classNameMatch[1]) {
                return { stdout: '', stderr: '', error: 'Java code must contain a public class definition (e.g., public class Main).', command: '' };
            }
            const className = classNameMatch[1];
            filePath = path.join(tempDir, `${className}.java`); // Java file name must match class name
            // Compile then run. `-cp ${tempDir}` adds the temp directory to the classpath for `java` command.
            rawCommand = `javac ${filePath} -d ${tempDir} && java -cp ${tempDir} ${className}`;
            cleanupFiles.push(filePath, path.join(tempDir, `${className}.class`));
            executableCommand = 'java';
            break;
        default:
            return { stdout: '', stderr: '', error: `Unsupported language: ${language}`, command: '' };
    }

    try {
        // Write the code to the temporary file
        fs.writeFileSync(filePath, code);

        // Determine the default shell path (e.g., /bin/zsh, /bin/bash).
        // Fallback to /bin/zsh if process.env.SHELL is not set.
        const defaultShellPath = process.env.SHELL || '/bin/zsh'; // Changed fallback to /bin/zsh

        // Construct the full command to be executed by `exec`.
        // We explicitly tell the shell to run as a login shell (-l) and execute the string (-c).
        // This ensures environment variables (like PATH) are loaded correctly.
        const commandToExecute = `${defaultShellPath} -l -c "${rawCommand.replace(/"/g, '\\"')}"`; // Escape quotes in rawCommand

        console.log(`[CodeRunner Debug] Using shell: ${defaultShellPath}`);
        console.log(`[CodeRunner Debug] Command to execute: ${commandToExecute}`);


        // Execute the command
        const { stdout, stderr } = await new Promise<any>((resolve, reject) => {
            // `exec` options:
            // `cwd`: Current working directory for the spawned process.
            // `timeout`: Max time in ms the process is allowed to run. Prevents infinite loops.
            // `killSignal`: Signal to send if timeout occurs.
            // `shell`: Pass only the path to the shell executable. The `-l -c` is now part of the command string.
            exec(commandToExecute, { cwd: tempDir, timeout: 5000, killSignal: 'SIGTERM', shell: defaultShellPath }, (error, stdout, stderr) => {
                if (error) {
                    let errorMessage = error.message;
                    if (error.message.includes('command not found')) {
                        errorMessage = `Error: '${executableCommand}' command not found. Please ensure '${executableCommand}' is installed and accessible in your system's PATH.
                        \nIf it is installed, try running 'which ${executableCommand}' in your terminal to find its path.
                        \nThen, consider adding its directory to your shell's PATH (e.g., in ~/.zshrc or ~/.bashrc) and restarting Raycast.`;
                    }
                    reject({ stdout, stderr, error: errorMessage, command: commandToExecute });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });

        return { stdout, stderr, error: null, command: commandToExecute };
    } catch (e: any) {
        // Catch errors during file writing or initial command execution issues
        return { stdout: e.stdout || '', stderr: e.stderr || '', error: e.error || e.message || 'Unknown error during execution', command: '' };
    } finally {
        // Clean up temporary files
        cleanupFiles.forEach(file => {
            if (fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                } catch (cleanupError: any) {
                    console.error(`Error cleaning up file ${file}: ${cleanupError.message}`);
                }
            }
        });
        // Optionally, remove the temp directory if it's empty after cleanup
        try {
            if (fs.readdirSync(tempDir).length === 0) {
                fs.rmdirSync(tempDir);
            }
        } catch (dirCleanupError: any) {
            // Ignore if directory is not empty or other cleanup issues
            // console.warn(`Could not remove temp directory ${tempDir}: ${dirCleanupError.message}`);
        }
    }
}
