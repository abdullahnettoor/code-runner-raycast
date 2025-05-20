import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
} from "@raycast/api";
import React, { useState } from "react";
import { runCode, CodeExecutionResult } from "./utils/codeRunner"; // Import the code runner utility

// Define the available languages for the dropdown
interface Language {
  name: string;
  value: string;
}

const languages: Language[] = [
  { name: "JavaScript", value: "javascript" },
  { name: "Python", value: "python" },
  { name: "Go", value: "go" },
  { name: "Java", value: "java" },
];

/**
 * Main Raycast command component for the Local Code Runner.
 * Allows users to input code, select a language, and execute it locally.
 * Displays results directly within the form.
 */
export default function Command() {
  const [code, setCode] = useState<string>(`console.log("Hello from JavaScript!");`);
  const [language, setLanguage] = useState<string>("javascript");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CodeExecutionResult | null>(null); // State to hold the execution result

  /**
   * Handles the execution of the code.
   * Displays toast messages for loading, success, or error.
   * Updates the result state to display output directly in the form.
   */
  async function handleRunCode() {
    setIsLoading(true);
    setResult(null); // Clear previous results before new execution

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Running code...",
    });

    try {
      const executionResult = await runCode(language, code);
      setResult(executionResult); // Set the result to be displayed

      // Log the command executed for development purposes
      console.log(`[CodeRunner] Command Executed: ${executionResult.command}`);

      if (executionResult.error) {
        toast.style = Toast.Style.Failure;
        toast.title = "Code execution failed!";
        toast.message = executionResult.error;
      } else {
        toast.style = Toast.Style.Success;
        toast.title = "Code executed successfully!";
        toast.message = "Output displayed below.";
      }
    } catch (error: any) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to run code!";
      toast.message = error.message || "An unknown error occurred.";
      // Set an error result object in case of an uncaught exception during runCode
      setResult({ stdout: '', stderr: '', error: error.message || 'Unknown error', command: '' });
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Updates the code example when the language selection changes.
   */
  function handleLanguageChange(newValue: string) {
    setLanguage(newValue);
    setResult(null); // Clear results when language changes
    switch (newValue) {
      case "javascript":
        setCode(`console.log("Hello from JavaScript!");\nlet a = 10;\nlet b = 20;\nconsole.log("Sum:", a + b);`);
        break;
      case "python":
        setCode(`print("Hello from Python!")\nx = 5\ny = 3\nprint(f"Product: {x * y}")`);
        break;
      case "go":
        setCode(`package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n    a, b := 7, 2\n    fmt.Printf("Division: %f\\n", float64(a) / float64(b))\n}`);
        break;
      case "java":
        setCode(`public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n        int num1 = 15;\n        int num2 = 4;\n        System.out.println("Difference: " + (num1 - num2));\n    }\n}`);
        break;
      default:
        setCode("");
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Code" onSubmit={handleRunCode} />
          <Action title="Clear Code" onAction={() => setCode("")} />
          {/* Add actions to copy output if result is available */}
          {result && result.stdout && (
            <Action.CopyToClipboard title="Copy Standard Output" content={result.stdout} />
          )}
          {result && result.stderr && (
            <Action.CopyToClipboard title="Copy Standard Error" content={result.stderr} />
          )}
          {result && result.error && (
            <Action.CopyToClipboard title="Copy Error Message" content={result.error} />
          )}
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="language"
        title="Language"
        value={language}
        onChange={handleLanguageChange}
      >
        {languages.map((lang) => (
          <Form.Dropdown.Item key={lang.value} title={lang.name} value={lang.value} />
        ))}
      </Form.Dropdown>

      <Form.TextArea
        id="code"
        title="Code"
        placeholder="Enter your code here..."
        value={code}
        onChange={setCode}
        autoFocus
      />

      {/* Display Results Section */}
      {result && (
        <React.Fragment>
          <Form.Separator />
          {/* Standard Output is always shown if a result exists */}
          <Form.TextArea
            id="stdout"
            title="Standard Output"
            value={result.stdout || "No standard output."}
            placeholder="No standard output."
            autoFocus={false}
          />
          {/* Standard Error is shown only if stderr content exists */}
          {result.stderr && (
            <Form.TextArea
              id="stderr"
              title="Standard Error"
              value={result.stderr}
              placeholder="No standard error."
              autoFocus={false}
            />
          )}
          {/* Execution Error is shown only if an error message exists */}
          {result.error && (
            <Form.TextArea
              id="error"
              title="Execution Error"
              value={result.error}
              placeholder="No execution error."
              autoFocus={false}
            />
          )}
        </React.Fragment>
      )}
    </Form>
  );
}
