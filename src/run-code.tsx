import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Image,
  LocalStorage,
  Icon,
} from "@raycast/api";
import React, { useState, useEffect } from "react";
import { runCode, CodeExecutionResult, detectInstalledLanguages, DetectedLanguage } from "./utils/codeRunner";
import { logoMap } from "./utils/imageMap";

// LocalStorage Key for storing detected languages
const LANGUAGES_STORAGE_KEY = "detected_languages";
const LAST_USED_LANGUAGE_KEY = "lastUsedLanguage";

/**
 * Main Raycast command component for the Local Code Runner.
 * Allows users to input code, select a language, and execute it locally.
 * Displays results directly within the form.
 */
export default function Command() {
  const [code, setCode] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  // Renamed: This tracks initial setup and explicit language re-detection
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  // NEW State: This tracks only the code execution process
  const [isExecutingCode, setIsExecutingCode] = useState<boolean>(false);

  const [result, setResult] = useState<CodeExecutionResult | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<DetectedLanguage[]>([]);

  // Function to get initial code based on the selected language.
  const getInitialCodeForLanguage = (langValue: string): string => {
    switch (langValue) {
      case "javascript":
        return `console.log("Hello from JavaScript!");\nlet a = 10;\nlet b = 20;\nconsole.log("Sum:", a + b);`;
      case "python":
        return `print("Hello from Python!")\nx = 5\ny = 3\nprint(f"Product: {x * y}")`;
      case "go":
        return `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n    a, b := 7, 2\n    fmt.Printf("Division: %f\\n", float64(a) / float64(b))\n}`;
      default:
        return "";
    }
  };

  /**
   * Performs the language detection and updates state and local storage.
   * This is used for initial load and explicit "Detect New Languages" action.
   * @param showLoadingToast Whether to show a toast message during detection.
   */
  async function performLanguageDetection(showLoadingToast: boolean = false) {
    setIsInitializing(true); // Set initializing to true
    let toast: Toast | undefined;

    if (showLoadingToast) {
      toast = await showToast({
        style: Toast.Style.Animated,
        title: "Detecting languages...",
      });
    }

    try {
      const detected = await detectInstalledLanguages();
      setAvailableLanguages(detected);

      if (detected.length === 0) {
        setLanguage(""); // No language selected if none detected
        setCode(""); // Ensure code is empty if no languages
        if (toast) {
          toast.style = Toast.Style.Failure;
          toast.title = "No supported languages found!";
          toast.message = "Please ensure Node.js, Python3, or Go are installed and in your PATH.";
        }
        await LocalStorage.removeItem(LANGUAGES_STORAGE_KEY); // Clear stale language cache
        return;
      }

      await LocalStorage.setItem(LANGUAGES_STORAGE_KEY, JSON.stringify(detected));

      // Determine the language to use after detection: last used, or first detected
      const savedLanguage = await LocalStorage.getItem<string>(LAST_USED_LANGUAGE_KEY);
      const matchedLanguageValue = detected.find((lang) => lang.value === savedLanguage)?.value ?? detected[0].value;

      setLanguage(matchedLanguageValue);

      // Load saved code for the matched language, or use initial snippet
      const savedCode = await LocalStorage.getItem<string>(`code_${matchedLanguageValue}`);
      setCode(savedCode || getInitialCodeForLanguage(matchedLanguageValue));

      await LocalStorage.setItem(LAST_USED_LANGUAGE_KEY, matchedLanguageValue);

      if (toast) {
        toast.style = Toast.Style.Success;
        toast.title = "Languages detected!";
        toast.message = detected.length > 0 ? "Ready to run code." : "No supported languages found.";
      }
    } catch (error: any) {
      if (toast) {
        toast.style = Toast.Style.Failure;
        toast.title = "Language detection failed!";
        toast.message = error.message || "An unknown error occurred during language detection.";
      }
      console.error("[Language Detection Error]", error);
      setLanguage("");
      setCode("");
      await LocalStorage.removeItem(LANGUAGES_STORAGE_KEY); // Clear stale language cache on error
    } finally {
      setIsInitializing(false); // Always set initializing to false at the end of detection
    }
  }

  // Effect to initialize the extension: load languages from cache or detect
  useEffect(() => {
    async function initializeExtension() {
      setIsInitializing(true); // Ensure initializing state is active

      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Initializing...",
      });

      try {
        const cachedLanguages = await LocalStorage.getItem<string>(LANGUAGES_STORAGE_KEY);
        let detected: DetectedLanguage[] = [];

        if (cachedLanguages) {
          try {
            detected = JSON.parse(cachedLanguages);
            setAvailableLanguages(detected);
            if (detected.length > 0) {
              const savedLanguage = await LocalStorage.getItem<string>(LAST_USED_LANGUAGE_KEY);
              const matchedLanguageValue = detected.find((lang) => lang.value === savedLanguage)?.value ?? detected[0].value;
              setLanguage(matchedLanguageValue);
              const savedCode = await LocalStorage.getItem<string>(`code_${matchedLanguageValue}`);
              setCode(savedCode || getInitialCodeForLanguage(matchedLanguageValue));
              await LocalStorage.setItem(LAST_USED_LANGUAGE_KEY, matchedLanguageValue);
              toast.style = Toast.Style.Success;
              toast.title = "Languages loaded from cache!";
              toast.message = "Enter code and run.";
            } else {
              // Cache was empty or invalid, trigger a fresh detection
              console.log("[Initialization] Cached languages array is empty, performing fresh detection.");
              await performLanguageDetection(false);
            }
          } catch (parseError) {
            console.error("[LocalStorage Parse Error]", parseError);
            toast.style = Toast.Style.Failure;
            toast.title = "Failed to load cached languages. Re-detecting...";
            await performLanguageDetection(false); // Trigger detection if parsing fails
          }
        } else {
          // No cached languages, perform initial detection
          console.log("[Initialization] No cached languages found, performing initial detection.");
          await performLanguageDetection(false);
        }
      } catch (error: any) {
        toast.style = Toast.Style.Failure;
        toast.title = "Initialization failed!";
        toast.message = error.message || "An unknown error occurred during initialization.";
        console.error("[Initialization Error]", error);
        setLanguage("");
        setCode("");
      } finally {
        setIsInitializing(false); // Always set initializing to false at the end of initialization
      }
    }

    initializeExtension();
  }, []); // Run only once on mount

  /**
   * Handles the execution of the code.
   * Displays toast messages for loading, success, or error.
   * Updates the result state to display output directly in the form.
   */
  async function handleRunCode() {
    setIsExecutingCode(true); // Set executing code to true
    setResult(null); // Clear previous results before new execution

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Running code...",
    });

    try {
      if (!code.trim()) {
        toast.style = Toast.Style.Failure;
        toast.title = "No code provided!";
        toast.message = "Please enter some code to run.";
        return;
      }

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
      setResult({ stdout: '', stderr: '', error: error.message || 'Unknown error', command: null });
    } finally {
      setIsExecutingCode(false); // Always set executing code to false
    }
  }

  /**
   * Updates the code example when the language selection changes, or triggers re-detection.
   */
  async function handleLanguageChange(newValue: string) {
    if (newValue === "detect-new-languages") {
      await performLanguageDetection(true); // Trigger re-detection with toast
      return; // Do not proceed with language change logic
    }

    // Save current code before changing language
    await LocalStorage.setItem(`code_${language}`, code);
    setLanguage(newValue);
    setResult(null); // Clear results when language changes

    // Load saved code for the new language, or set to default example
    const savedCode = await LocalStorage.getItem<string>(`code_${newValue}`);
    setCode(savedCode || getInitialCodeForLanguage(newValue)); // Use saved code or default
    await LocalStorage.setItem(LAST_USED_LANGUAGE_KEY, newValue); // Save to storage
  }

  /**
   * Handles code changes in the TextArea.
   * Saves the code to local storage.
   */
  const handleCodeChange = async (newCode: string) => {
    setCode(newCode);
    await LocalStorage.setItem(`code_${language}`, newCode); // Persist code for current language
  };

  // --- Render Logic based on isInitializing and availableLanguages ---

  // 1. Show a general loading screen if isInitializing is true
  if (isInitializing) {
    return (
      <Form isLoading={true}>
        <Form.Description
          title="Loading"
          text="Detecting available languages..."
        />
      </Form>
    );
  }

  // 2. If isInitializing is false, but no languages were detected at all
  if (availableLanguages.length === 0) {
    return (
      <Form isLoading={false}> {/* isInitializing is false here */}
        <Form.Description
          title="No Supported Languages Found"
          text="Please ensure Node.js, Python3, or Go are installed and in your system's PATH."
        />
        <ActionPanel>
          <Action title="Retry Language Detection" onAction={() => performLanguageDetection(true)} />
        </ActionPanel>
      </Form>
    );
  }

  // 3. If isInitializing is false and languages are available, show the main form
  return (
    <Form
      isLoading={isExecutingCode} // This isLoading is for the runCode process (shows spinner on form)
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Code" onSubmit={handleRunCode} />
          <Action title="Clear Code" onAction={() => handleCodeChange("")} />
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
        {availableLanguages.map((lang) => (
          <Form.Dropdown.Item
            key={lang.value}
            title={lang.name}
            value={lang.value}
            icon={{
              source: logoMap[lang.value] as Image.Source,
              mask: Image.Mask.RoundedRectangle,
            }}
          />
        ))}
        <Form.Dropdown.Item
          key="detect-new-languages"
          title="✨ Detect New Languages"
          value="detect-new-languages"
          icon={Icon.MagnifyingGlass}
        />
      </Form.Dropdown>

      <Form.TextArea
        id="code"
        title="Code"
        placeholder="Enter your code here..."
        value={code}
        onChange={handleCodeChange}
        autoFocus
        enableMarkdown
      />

      {/* Display Results Section */}
      {result && (
        <React.Fragment>
          <Form.Separator />
          <Form.TextArea
            id="stdout"
            title="Standard Output"
            value={result.stdout || "No standard output."}
            placeholder="No standard output."
            autoFocus={false}
          />
          {result.stderr && (
            <Form.TextArea
              id="stderr"
              title="Standard Error"
              value={result.stderr}
              placeholder="No standard error."
              autoFocus={false}
            />
          )}
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