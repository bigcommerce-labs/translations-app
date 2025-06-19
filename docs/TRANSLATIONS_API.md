AI Agent Integration Guide: Bulk Translation API
================================================

This document provides best practices and operational guidance for integrating with the Bulk Translation API. Its purpose is to augment the formal OpenAPI specification with contextual information to ensure efficient, cost-effective, and accurate use of the service.

1\. Core API Functionality
--------------------------

The primary function of this API is to translate all, or a targeted subset, of string values within a complex JSON object from a source language to a target language. It is designed to:

*   Preserve the original structure of the JSON object.
    
*   Intelligently handle both plain text and HTML content by automatically routing them to the most efficient translation pipeline.
    
*   Allow for precise control over which data gets translated.
    

2\. API Request Structure
-------------------------

All requests must be POST requests to the service endpoint. The body of the request must be application/json.

### Key Request Fields:

**FieldTypeRequired?Description**

target\_language

String

**Yes**

The ISO 639-1 code for the language you wish to translate into (e.g., "es", "fr", "ja").

payload

Object

**Yes**

The complete JSON object containing the data you want to translate. The API will traverse this object to find strings.

source\_language

String

No

The ISO 639-1 code of the source text. If omitted, the API will automatically detect the language, which may incur a very slight performance cost. **Best Practice:** Provide this if you know it.

translate\_keys

Array of Strings

No

A list of specific keys whose string values should be translated. **This is the most important field for ensuring accuracy and cost-effectiveness.**

3\. Best Practice: Always Use translate\_keys
---------------------------------------------

While the translate\_keys field is optional, it is **highly recommended** for all production use cases.

**Rationale:** JSON payloads often contain a mix of human-readable content and machine-readable strings (e.g., product IDs, SEO slugs, CSS class names, unique identifiers). Attempting to translate machine-readable strings can lead to corrupted data, broken application logic, and unnecessary costs.

### How to Use translate\_keys:

1.  **Identify Translatable Content:** Before constructing the API call, analyze the payload schema and identify which keys contain human-readable text intended for translation. Common examples include name, description, title, label, message, caption, display\_name.
    
2.  **Populate the Array:** Create an array containing only the names of these identified keys.
    

**Example Scenario:**

Given this payload:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {      "product_id": "SKU-TOWEL-77-BG",      "title": "Chambray Towel",      "summary": "A soft, absorbent linen towel.",      "is_active": true  }   `

An **incorrect** request would omit translate\_keys. This would wastefully send "SKU-TOWEL-77-BG" to the translation service.

A **correct** and **efficient** request would be:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {      "target_language": "de",      "translate_keys": ["title", "summary"],      "payload": {          "product_id": "SKU-TOWEL-77-BG",          "title": "Chambray Towel",          "summary": "A soft, absorbent linen towel.",          "is_active": true      }  }   `

This request correctly instructs the API to only process the strings for title and summary, ignoring the product\_id.

4\. Understanding the Response
------------------------------

The API will respond with a status code of 200 OK for successful requests. The body will contain:

**FieldTypeDescription**

translated\_payload

Object

The original payload object with the targeted string values replaced by their translations. The structure is perfectly preserved.

source\_language

String

The detected or provided source language code.

target\_language

String

The target language code for the translation.

5\. Caching Strategy
--------------------

The translation process is deterministic. For a given payload, target\_language, and set of translate\_keys, the API will always return the same result. It is highly recommended to implement a caching layer on your end.

*   **Cache Key:** A composite key created from a hash of the payload object and the target\_language.
    
*   **Benefit:** Caching significantly reduces API costs and improves the latency of your application, especially for frequently requested content.
    

6\. Error Handling
------------------

*   400 Bad Request: This indicates a problem with your request. The error message will specify the issue. Common causes:
    
    *   Missing payload or target\_language.
        
    *   translate\_keys is not an array.
        
    *   The request body is not valid JSON.
        
*   405 Method Not Allowed: You used a method other than POST.
    
*   500 Internal Server Error: An unexpected error occurred on the server side. This should be rare. A safe retry strategy with exponential backoff is recommended.