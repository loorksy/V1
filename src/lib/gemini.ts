import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const getAI = () => {
  const storedKey = localStorage.getItem('GEMINI_API_KEY');
  let apiKey = storedKey || process.env.GEMINI_API_KEY;
  
  // Filter out the placeholder from .env.example
  if (apiKey === "MY_GEMINI_API_KEY") {
    apiKey = undefined;
  }

  if (!apiKey) {
    throw new Error("مفتاح Gemini API مفقود. الرجاء إدخاله في صفحة الإعدادات.");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Wrap generateContent with automatic retry on network/rate limit errors
  const originalGenerateContent = ai.models.generateContent.bind(ai.models);
  ai.models.generateContent = async (...args: any[]) => {
    let lastError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await originalGenerateContent(...args);
      } catch (error: any) {
        lastError = error;
        if ((isNetworkError(error) || isRateLimitError(error)) && attempt < 2) {
          const delay = 2000 * Math.pow(2, attempt);
          console.warn(`Retry ${attempt + 1}/2 in ${delay}ms: ${error.message}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };
  
  return ai;
};

const isPermissionError = (error: any) => {
  return error.message?.includes('403') || error.status === 403 || error.message?.includes('PERMISSION_DENIED');
};

const isRateLimitError = (error: any) => {
  return error.message?.includes('429') || error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED');
};

const isNetworkError = (error: any) => {
  return error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.message?.includes('network') || error.name === 'TypeError';
};

const withRetry = async <T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 2000): Promise<T> => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      const shouldRetry = isRateLimitError(error) || isNetworkError(error);
      if (shouldRetry && attempt < maxRetries - 1) {
        attempt++;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`Retrying in ${delay}ms (attempt ${attempt}/${maxRetries - 1}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries reached");
};

const handleCommonErrors = (error: any, defaultMessage: string) => {
  if (isRateLimitError(error)) {
    throw new Error("لقد تجاوزت الحد المسموح به للاستخدام (Rate Limit). يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.");
  }
  if (isPermissionError(error)) {
    throw new Error("تم رفض الوصول (403). تأكد من صلاحيات مفتاح API.");
  }
  if (isNetworkError(error)) {
    throw new Error("خطأ في الاتصال بالشبكة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.");
  }
  throw new Error(defaultMessage);
};

const extractImage = (result: any) => {
  const candidate = result.candidates?.[0];
  if (!candidate) {
     // Check prompt feedback if available
     if (result.promptFeedback) {
        throw new Error(`Blocked by prompt feedback: ${JSON.stringify(result.promptFeedback)}`);
     }
     throw new Error("No candidates returned from Gemini");
  }
  
  const part = candidate.content?.parts?.find((p: any) => p.inlineData);
  if (part && part.inlineData && part.inlineData.data) {
    const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    console.log(`Image extracted successfully. Size: ${Math.round(dataUrl.length / 1024)}KB`);
    return dataUrl;
  }
  
  // Check for text refusal/error
  const textPart = candidate.content?.parts?.find((p: any) => p.text);
  if (textPart?.text) {
    // If text is present, it might be a refusal or just a description.
    // We treat it as an error since we expected an image.
    throw new Error(`Model returned text instead of image: "${textPart.text.slice(0, 200)}..."`);
  }
  
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Generation stopped with reason: ${candidate.finishReason}`);
  }

  throw new Error(`No image generated. Model response: ${JSON.stringify(candidate)}`);
};

export const GeminiService = {
  // Generate story metadata (title, description, hashtags) for thumbnail
  async generateStoryMetadata(story: any): Promise<{ videoTitle: string; videoDescription: string; hashtags: string }> {
    const ai = getAI();
    const sceneSummary = (story.scenes || []).map((s: any, i: number) => 
      `مشهد ${i + 1}: ${s.description || ''}. الحوار: ${s.dialogue || 'بدون'}`
    ).join('\n');
    
    const dialogueLang = (story.scenes || []).find((s: any) => s.dialogue)?.dialogue || '';
    const isArabic = /[\u0600-\u06FF]/.test(dialogueLang);
    const lang = isArabic ? 'العربية' : 'الإنجليزية';
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `أنت خبير يوتيوب محترف متخصص في محتوى الأطفال.

حلل هذه القصة وأنشئ بيانات الفيديو بلغة ${lang}:

القصة: ${story.script || story.title || ''}

المشاهد:
${sceneSummary}

أنشئ:
1. "videoTitle": عنوان فيديو جذاب (hook) يجذب المشاهدين - قصير ومثير (أقل من 70 حرف)
2. "videoDescription": وصف مفصل للفيديو (3-5 أسطر) يتضمن ملخص القصة + دعوة للاشتراك
3. "hashtags": 15-20 هاشتاق مناسب مفصول بمسافات (مثل #أطفال #قصص_أطفال)

أخرج JSON فقط.` }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            videoTitle: { type: Type.STRING },
            videoDescription: { type: Type.STRING },
            hashtags: { type: Type.STRING },
          }
        }
      }
    });
    const text = result.text || '{}';
    return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
  },


  // Generate a story idea using AI
  async generateStoryIdea(charNames: string[], genre: string, hint?: string): Promise<string> {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `أنت كاتب سيناريو محترف. اكتب فكرة قصة قصيرة (3-4 جمل) من نوع "${genre}" تتضمن الشخصيات التالية: ${charNames.join(' و ')}.
${hint ? `ملاحظة المستخدم: ${hint}` : ''}
اكتب الفكرة بالعربية فقط. لا تكتب أي شيء آخر غير الفكرة.` }] }],
    });
    return result.text?.trim() || '';
  },

  async testConnection(): Promise<boolean> {
    try {
      const ai = getAI();
      await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Test"
      });
      return true;
    } catch (error: any) {
      console.error("Test connection failed:", error);
      if (isPermissionError(error)) {
        throw new Error("تم رفض الوصول (403). تأكد من أن مفتاح API صحيح، وأن مشروع Google Cloud مرتبط بحساب فوترة (Billing Account) ومفعل عليه Generative Language API.");
      }
      throw error;
    }
  },

  // 1. Analyze Character Traits (Thinking Mode)
  async analyzeCharacter(imageBase64: string): Promise<string> {
    try {
      const ai = getAI();
      const prompt = `
        Analyze this character image in extreme detail for the purpose of creating a consistent character profile for animation.
        Focus on:
        1. Physical features (hair style/color, eye shape/color, face structure, body type).
        2. Clothing details (style, colors, specific items, textures).
        3. Distinctive accessories or markings.
        4. Overall art style (e.g., pixar-style, anime, realistic, watercolor).
        
        Provide a concise but comprehensive visual description that can be used as a prompt to recreate this character.
        Output in Arabic.
      `;

      // Strip header if present
      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/png", data: base64Data } }
            ]
          }
        ],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        }
      });

      return result.text || "";
    } catch (error: any) {
      if (isPermissionError(error)) {
        throw new Error("فشل تحليل الشخصية. تأكد من صحة مفتاح Gemini API.");
      }
      throw error;
    }
  },

  // 2. Generate Character Angles (Nano Banana 3 Pro)
  async generateCharacterAngle(description: string, angle: 'front' | 'left side' | 'right side' | '3/4 view'): Promise<string> {
    const ai = getAI();
    const prompt = `
      Generate a character image based on this description:
      ${description}
      
      View Angle: ${angle}
      Background: Neutral white or transparent.
      Style: Consistent character design sheet.
    `;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          imageConfig: { imageSize: "1K" }
        }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الصورة (403). تأكد من صلاحيات مفتاح API لنموذج gemini-3-pro-image-preview.");
      }
      throw error;
    }
  },

  // 3. Generate Script & Scenes (Thinking Mode)
  async generateScriptAndScenes(idea: string, characters: {name: string, description: string, visualTraits?: string}[]): Promise<{script: string, scenes: {description: string, characters: string[], dialogue: string}[]}> {
    try {
      const ai = getAI();
      const charContext = characters.map(c => `- ${c.name}: ${c.description}${c.visualTraits ? `. المظهر الثابت (لا يتغير أبداً): ${c.visualTraits}` : ''}`).join("\n");
      
      // Extract dialogue language from the idea string
      const langMatch = idea.match(/لغة الحوار: (.+?)\./);
      const dialogueLang = langMatch ? langMatch[1] : 'العربية';
      
      const prompt = `أنت مخرج أفلام أطفال ومصور سينمائي محترف. أنشئ سيناريو كامل ومفصل بناءً على هذه الفكرة: "${idea}".

⚠️ يجب أن يكون عدد المشاهد بالضبط: ${idea.match(/عدد المشاهد: (\d+)/)?.[1] || '5'} مشهد. لا أقل ولا أكثر!

الشخصيات المتاحة:
${charContext}

⛔ قاعدة ثبات الشخصية (الأهم):
- ملابس الشخصية وتفاصيلها لا تتغير أبداً بين المشاهد
- نفس الشعر، نفس لون العيون، نفس الملابس بالضبط في كل مشهد
- في وصف المشهد الإنجليزي: استخدم اسم الشخصية (مثال: "${characters[0]?.name || 'الشخصية'}") ثم اذكر ملابسها بالضبط بين قوسين
- مثال: "${characters[0]?.name || 'Jad'} (wearing the same black ninja outfit and glasses as in Scene 1)"

🎨 قاعدة الألوان والبيئة (محتوى أطفال):
- الألوان يجب أن تكون زاهية ومريحة للعين مثل فيديوهات الأطفال على يوتيوب
- خلفيات بألوان باستيل دافئة (أصفر فاتح، أزرق سماوي، أخضر فاتح، وردي هادئ)
- إضاءة مشرقة ودافئة في كل المشاهد
- البيئة مرحة ومبهجة مناسبة للأطفال

⚡ قاعدة الاستمرارية: كل مشهد مدته 8 ثوانٍ. المشاهد لقطات متتالية متصلة.
- المشهد الثاني يبدأ من حيث انتهى الأول بالضبط

🗣️ قاعدة الحوار:
- لغة الحوار: ${dialogueLang}
- كل مشهد يجب أن يحتوي على حوار كامل ومفصل بـ${dialogueLang}
- إذا كان أكثر من شخصية في المشهد، اكتب حوار لكل شخصية
- اكتب اسم الشخصية قبل حوارها مثل: "${characters[0]?.name || 'أحمد'}: مرحباً!"
- الحوار يبدأ من بداية المشهد وينتهي في نهايته
- الحوار يكون طويل ومفصل وليس جملة واحدة

أخرج JSON:
1. "script": القصة الكاملة المفصلة بالعربية (ليس ملخص! بل كل تفاصيل القصة والأحداث)
2. "scenes": مصفوفة من المشاهد، كل مشهد يحتوي:
   - "description": وصف بصري سينمائي مفصل بالإنجليزية يتضمن: اسم الشخصية + (ملابسها الثابتة)، نوع اللقطة، ألوان زاهية، الفم مفتوح يتكلم
   - "characters": أسماء الشخصيات في المشهد
   - "dialogue": الحوار الكامل بـ${dialogueLang} مع ذكر اسم كل شخصية قبل كلامها`;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              script: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    description: { type: Type.STRING },
                    characters: { type: Type.ARRAY, items: { type: Type.STRING } },
                    dialogue: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const text = result.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonString);
      return {
        script: parsed.script || '',
        scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
      };
    } catch (error: any) {
      if (isPermissionError(error)) {
        throw new Error("فشل توليد السيناريو. تأكد من صحة مفتاح Gemini API.");
      }
      throw error;
    }
  },

  // 4. Generate Storyboard Frame - character refs + first scene + previous scene for max consistency
  async generateStoryboardFrame(params: {
    sceneDescription: string;
    characterImages: string[];
    firstSceneImage?: string;
    previousSceneImage?: string;
    sceneIndex: number;
    totalScenes: number;
    style: string;
    aspectRatio: '16:9' | '9:16' | '1:1';
    characterDNA: string;
  }): Promise<string> {
    const ai = getAI();
    const { sceneDescription, characterImages, firstSceneImage, previousSceneImage, sceneIndex, totalScenes, style, aspectRatio, characterDNA } = params;
    
    const parts: any[] = [];
    
    // === STEP 1: Character reference images FIRST (highest priority) ===
    if (characterImages.length > 0) {
      parts.push({ text: `REFERENCE CHARACTER IMAGES - The characters in this scene MUST look EXACTLY like these. Copy their face, body, fur, clothing, colors PIXEL BY PIXEL. DO NOT redesign:` });
      characterImages.slice(0, 3).forEach((img) => {
        const base64Data = img.includes(',') ? img.split(',')[1] : img;
        if (base64Data.length > 100) {
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
        }
      });
    }

    // === STEP 2: Previous scene image for continuity ===
    if (sceneIndex > 0 && previousSceneImage) {
      parts.push({ text: `\nPREVIOUS SCENE (Scene ${sceneIndex}) - Your new scene MUST continue directly from this image. Same world, same character appearance, same art style:` });
      const prevData = previousSceneImage.includes(',') ? previousSceneImage.split(',')[1] : previousSceneImage;
      if (prevData.length > 100) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: prevData } });
      }
    }

    // === STEP 3: Scene description ===
    let promptText = `\nGenerate scene ${sceneIndex + 1} of ${totalScenes}. Style: ${style}.

CHARACTER DNA (MUST be identical to reference images above):
${characterDNA}

SCENE TO GENERATE:
${sceneDescription}

DIRECTOR'S RULES:
1. CHARACTER IDENTITY: COPY the exact character from the reference images above. Same face shape, same fur/skin color, same clothes, same accessories. NOT similar - IDENTICAL.
2. CONTINUITY: ${sceneIndex === 0 ? 'This is the ESTABLISHING SHOT. Create a bright, warm, kid-friendly environment. This scene sets the visual standard for ALL following scenes.' : `This scene continues from the PREVIOUS SCENE image above. The camera has moved to a new angle but the world is the SAME.`}
3. KID-FRIENDLY VISUALS: Bright pastel colors (soft yellow, sky blue, light green, pink). Warm lighting. No dark or scary elements. Like a high-quality children's YouTube animation.
4. SPEAKING: Characters should have their mouth slightly open as if talking/speaking.
5. CINEMATIC QUALITY: Professional camera angle, proper composition, depth of field. Think Pixar quality for kids.`;

    parts.push({ text: promptText });

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["image", "text"],
          imageConfig: { aspectRatio }
        }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isPermissionError(error)) {
        throw new Error("فشل توليد المشهد (403). تأكد من صلاحيات مفتاح API.");
      }
      throw error;
    }
  },

  // 5. Generate Video Clip (Veo3)
  async generateVideoClip(startFrame: string, endFrame: string, aspectRatio: '16:9' | '9:16' = '16:9', cameraMotion?: string): Promise<string> {
    try {
      const ai = getAI();
      const startBase64 = startFrame.includes(',') ? startFrame.split(',')[1] : startFrame;
      const startMime = "image/png"; // Simplified
      
      const endBase64 = endFrame.includes(',') ? endFrame.split(',')[1] : endFrame;
      const endMime = "image/png";

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: cameraMotion ? `Camera motion: ${cameraMotion}` : undefined,
        image: {
          imageBytes: startBase64,
          mimeType: startMime,
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio,
          lastFrame: {
            imageBytes: endBase64,
            mimeType: endMime
          }
        }
      });

      // Poll for completion
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) throw new Error("Video generation failed");

      // Fetch the actual video blob
      const storedKey = localStorage.getItem('GEMINI_API_KEY');
      const apiKey = storedKey || process.env.GEMINI_API_KEY!;

      const response = await fetch(videoUri, {
          headers: {
              'x-goog-api-key': apiKey
          }
      });
      
      const blob = await response.blob();
      // Convert to Base64 Data URL for persistence
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error: any) {

      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الفيديو (403). نموذج veo-3.1-fast-generate-preview يتطلب مشروع Google Cloud مدفوع (Paid Billing). تأكد من تفعيل الفوترة و Generative Language API.");
      }
      if (error?.message?.includes('not found') || error?.message?.includes('NOT_FOUND')) {
        throw new Error("نموذج veo-3.1-fast-generate-preview غير متاح. تأكد من أن مشروعك يدعم نماذج Veo.");
      }
      throw new Error(`فشل توليد الفيديو: ${error?.message || 'خطأ غير معروف'}`);
    }
  },

  // 6. Generate Voiceover (TTS)
  async generateVoiceover(text: string, voiceName: string = 'Zephyr'): Promise<string> {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio generated");
      
      return `data:audio/wav;base64,${base64Audio}`;
    } catch (error: any) {
      console.error("TTS Error:", error);
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الصوت (403). تأكد من صلاحيات المفتاح لنموذج TTS.");
      }
      throw new Error("فشل توليد الصوت.");
    }
  },

  // 7. Generate Surreal Object (Faceless Trend)
  async generateSurrealObject(params: {
    objectName: string;
    emotion: string;
    style: string;
    body: string;
    limbs: string;
    hair: string;
    cameraAngle: string;
    lighting: string;
    environment: string;
    generateNormal?: boolean;
  }): Promise<{ surreal: string; normal?: string }> {
    const ai = getAI();
    
    const surrealPrompt = `A highly detailed, hyper-realistic shot of an anthropomorphic ${params.objectName} character. 
    CRITICAL INSTRUCTION: The character's face MUST be made ENTIRELY out of the natural material, color, and texture of a ${params.objectName}. DO NOT paste a realistic human face or human skin onto it. The facial features (eyes, nose, mouth) should look like they organically grew, morphed, or were carved directly from the ${params.objectName}'s surface.
    Expression: ${params.emotion}. 
    Body type: ${params.body}. 
    Limbs/Hands: ${params.limbs}. 
    Hair/Top: ${params.hair}. 
    Camera Angle: ${params.cameraAngle}. 
    Lighting: ${params.lighting}. 
    Environment/Background: ${params.environment}. 
    Style: ${params.style}, 8k resolution, cinematic.`;

    const normalPrompt = `A highly detailed, hyper-realistic shot of a normal, everyday ${params.objectName}. 
    CRITICAL INSTRUCTION: This is a regular, inanimate object. DO NOT add any face, eyes, mouth, or human features whatsoever. It must look like a completely normal, natural ${params.objectName}.
    Camera Angle: ${params.cameraAngle}. 
    Lighting: ${params.lighting}. 
    Environment/Background: ${params.environment}. 
    Style: ${params.style}, 8k resolution, cinematic.`;

    const generateImage = async (promptText: string) => {
      try {
        const result = await ai.models.generateContent({
          model: "gemini-3-pro-image-preview",
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          config: { 
            imageConfig: { aspectRatio: "3:4" },
          }
        });
        return extractImage(result);
      } catch (error: any) {
        if (isRateLimitError(error)) {
          handleCommonErrors(error, "");
        }
        if (isPermissionError(error)) {
          throw new Error("فشل توليد الصورة (403). تأكد من صلاحيات مفتاح API لنموذج gemini-3-pro-image-preview.");
        }
        handleCommonErrors(error, "فشل توليد الصورة.");
        throw error;
      }
    };

    try {
      if (params.generateNormal) {
        const [surreal, normal] = await Promise.all([
          generateImage(surrealPrompt),
          generateImage(normalPrompt)
        ]);
        return { surreal, normal };
      } else {
        const surreal = await generateImage(surrealPrompt);
        return { surreal };
      }
    } catch (error: any) {
      console.error("Surreal Generation Error:", error);
      handleCommonErrors(error, "فشل توليد الصورة. حاول مرة أخرى.");
      throw error;
    }
  },

  // 7.5 Generate Creature Character
  async generateCreatureCharacter(params: {
    baseCreature: string;
    hybridCreature: string;
    bodyType: string;
    outfit: string;
    accessories: string;
    expression: string;
    style: string;
    background: string;
  }): Promise<string> {
    const ai = getAI();
    const prompt = `Create a highly detailed, professional character design of a creature.
    Base Creature: ${params.baseCreature}
    ${params.hybridCreature ? `Hybrid merged with: ${params.hybridCreature}` : ''}
    Body Type: ${params.bodyType}
    Outfit/Clothing: ${params.outfit}
    Accessories: ${params.accessories}
    Facial Expression: ${params.expression}
    Art Style: ${params.style}
    Background: ${params.background}
    
    CRITICAL INSTRUCTIONS:
    - The character must be the central focus, fully visible.
    - If Body Type is Humanoid, the creature should stand on two legs with human-like anatomy but keeping the creature's head, fur/scales, and tail/wings.
    - High quality, 8k resolution, masterpiece.
    - Aspect ratio MUST be 1:1.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isRateLimitError(error)) {
        handleCommonErrors(error, "");
      }
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الصورة (403). تأكد من صلاحيات مفتاح API لنموذج gemini-3-pro-image-preview.");
      }
      handleCommonErrors(error, "فشل توليد الصورة.");
      throw error;
    }
  },

  // 7.7 Generate Hybrid Character
  async generateCharacter(prompt: string): Promise<any> {
    const ai = getAI();
    
    try {
      // 1. Generate the character profile and name using text model
      const textResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\nOutput a JSON object with exactly these keys: "name" (a creative Arabic name), "description" (a short Arabic backstory/description).` }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING }
            }
          }
        }
      });

      const text = textResult.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      const profile = JSON.parse(jsonString);

      // 2. Generate the front view image using image model
      const imagePrompt = `${prompt}\n\nGenerate a character design sheet showing the front view. Neutral background. High quality, 8k resolution, masterpiece. Aspect ratio MUST be 1:1.`;
      
      const imageResult = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      
      const frontImage = extractImage(imageResult);

      return {
        name: profile.name || "شخصية هجينة",
        description: profile.description || "شخصية غامضة تم دمجها من مواد مختلفة.",
        front: frontImage,
        side: frontImage, // Fallback
        back: frontImage  // Fallback
      };

    } catch (error: any) {
      if (isRateLimitError(error)) {
        handleCommonErrors(error, "");
      }
      if (isPermissionError(error)) {
        throw new Error("فشل التوليد (403). تأكد من صلاحيات مفتاح API.");
      }
      handleCommonErrors(error, "فشل توليد الشخصية الهجينة.");
      throw error;
    }
  },

  // 7.6 Generate Viral Short Idea
  async generateViralShortIdea(params: { niche: string; tone: string; topic: string; characters?: string; sceneCount?: number }): Promise<any> {
    const ai = getAI();
    const prompt = `You are an expert YouTube Shorts and TikTok viral content strategist.
    Create a highly engaging, viral short video script (15-60 seconds) in Arabic.
    Niche: ${params.niche}
    Tone: ${params.tone}
    Specific Topic: ${params.topic || 'Surprise me with a trending topic in this niche'}
    ${params.characters ? `Characters to include: ${params.characters}` : ''}
    ${params.sceneCount ? `Number of scenes: Exactly ${params.sceneCount} scenes.` : ''}
    
    Output MUST be a valid JSON object with the following structure:
    {
      "title": "Catchy Video Title in Arabic",
      "hook": "The first 3 seconds hook to grab attention immediately (Arabic)",
      "visualConcept": "Brief description of what the viewer sees (Arabic)",
      "script": [
        {"time": "0:00-0:03", "visual": "...", "audio": "..."}
      ],
      "cta": "Call to action at the end (Arabic)",
      "tags": ["tag1", "tag2", "tag3"]
    }`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              hook: { type: Type.STRING },
              visualConcept: { type: Type.STRING },
              script: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    visual: { type: Type.STRING },
                    audio: { type: Type.STRING }
                  }
                }
              },
              cta: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      });
      const text = result.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (error: any) {
      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) throw new Error("فشل توليد الفكرة (403). تأكد من صلاحيات المفتاح.");
      handleCommonErrors(error, "فشل توليد الفكرة.");
      throw error;
    }
  },

  // 8. Auto-Generate Surreal Idea
  async generateRandomSurrealIdea(userPrompt?: string): Promise<any> {
    const ai = getAI();
    const prompt = `
      You are a creative director for a viral "faceless" YouTube Shorts channel.
      Generate a bizarre, surreal, and highly engaging anthropomorphic character idea.
      ${userPrompt ? `Base it loosely on this idea: "${userPrompt}"` : 'Make it completely random and unexpected (e.g., a crying piece of toast, an angry black hole, a disgusted sock).'}
      
      Output a JSON object with EXACTLY these keys (values must be strings in English, except where noted):
      - objectName: (e.g., "Toast", "Black Hole", "Sock")
      - emotion: (e.g., "Crying", "Angry", "Shocked", "Creepy", "Smiling")
      - style: (e.g., "Hyperrealistic", "Claymation", "3D Render", "Cinematic")
      - body: (e.g., "No body (face only)", "Tiny body", "Muscular", "Stick figure")
      - limbs: (e.g., "No limbs", "Cartoon arms", "Roots")
      - hair: (e.g., "Bald", "Grass", "Fire", "Smoke")
      - cameraAngle: "زاوية أمامية مباشرة (Front-facing)"
      - lighting: (e.g., "Cinematic dramatic", "Bright studio")
      - environment: "خلفية بيضاء نقية (Pure White)"
    `;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objectName: { type: Type.STRING },
              emotion: { type: Type.STRING },
              style: { type: Type.STRING },
              body: { type: Type.STRING },
              limbs: { type: Type.STRING },
              hair: { type: Type.STRING },
              cameraAngle: { type: Type.STRING },
              lighting: { type: Type.STRING },
              environment: { type: Type.STRING }
            }
          }
        }
      });

      const text = result.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error("Auto-generate error:", error);
      throw new Error("فشل توليد الفكرة العشوائية.");
    }
  },

  // 9. Generate Human Character
  async generateHumanCharacter(params: {
    gender: string;
    age: string;
    ethnicity: string;
    hair: string;
    eyeColor: string;
    bodyType: string;
    clothing: string;
    expression: string;
    style: string;
    environment: string;
    cameraAngle: string;
  }): Promise<string> {
    const ai = getAI();
    const prompt = `A highly detailed, hyper-realistic portrait of a human character.
    The following features are described in Arabic, please understand them and generate the corresponding image:
    Gender: ${params.gender}.
    Age: ${params.age}.
    Ethnicity/Skin Tone: ${params.ethnicity}.
    Hair: ${params.hair}.
    Eye Color: ${params.eyeColor}.
    Body Type: ${params.bodyType}.
    Clothing: ${params.clothing}.
    Expression: ${params.expression}.
    Camera Angle: ${params.cameraAngle}.
    Environment/Background: ${params.environment}.
    Style: ${params.style}.
    
    CRITICAL INSTRUCTION: You MUST generate an image. Do not output text. 8k resolution, highly detailed, cinematic lighting.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { imageConfig: { aspectRatio: "3:4" } }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isRateLimitError(error)) {
        handleCommonErrors(error, "");
      }
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الصورة (403). تأكد من صلاحيات مفتاح API لنموذج gemini-3-pro-image-preview.");
      }
      handleCommonErrors(error, "فشل توليد الصورة.");
      throw error;
    }
  },

  // 10. Auto-Generate Human Idea
  async generateRandomHumanIdea(): Promise<any> {
    const ai = getAI();
    const prompt = `
      You are an expert character designer. Generate a unique, interesting, and highly detailed human character concept.
      Output a JSON object with EXACTLY these keys (values MUST be strings in Arabic):
      - gender: (e.g., "ذكر", "أنثى")
      - age: (e.g., "شاب في العشرينات", "رجل عجوز في السبعينات", "مراهقة", "طفل")
      - ethnicity: (e.g., "عربي أسمر", "آسيوي", "أوروبي أشقر", "أفريقي", "حنطي البشرة")
      - hair: (e.g., "شعر أسود قصير ومجعد", "شعر أشقر طويل ومموج", "أصلع مع لحية كثيفة", "تسريحة ذيل حصان")
      - eyeColor: (e.g., "بني غامق", "أزرق فاتح", "أخضر زمردي", "عسلي")
      - bodyType: (e.g., "رياضي مفتول العضلات", "نحيف", "متوسط البنية", "ممتلئ")
      - clothing: (e.g., "ملابس سايبربانك مستقبلية مضيئة", "بدلة رسمية أنيقة", "ملابس كاجوال يومية", "درع فارس من العصور الوسطى", "ملابس نينجا")
      - expression: (e.g., "نظرة حادة وواثقة", "ابتسامة لطيفة", "ملامح غاضبة وجادة", "نظرة حزينة")
      - style: (e.g., "واقعي جداً (Hyperrealistic)", "أنمي (Anime)", "بيكسار 3D (Pixar 3D)", "سينمائي (Cinematic)")
      - environment: (e.g., "شارع مدينة ممطر ليلاً", "خلفية استوديو رمادية", "غابة مشمسة", "مقهى كلاسيكي")
      - cameraAngle: (e.g., "لقطة قريبة للوجه (Close-up)", "لقطة متوسطة (Medium shot)", "لقطة كاملة للجسم (Full body)")
    `;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              gender: { type: Type.STRING },
              age: { type: Type.STRING },
              ethnicity: { type: Type.STRING },
              hair: { type: Type.STRING },
              eyeColor: { type: Type.STRING },
              bodyType: { type: Type.STRING },
              clothing: { type: Type.STRING },
              expression: { type: Type.STRING },
              style: { type: Type.STRING },
              environment: { type: Type.STRING },
              cameraAngle: { type: Type.STRING }
            }
          }
        }
      });

      const text = result.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error("Auto-generate error:", error);
      throw new Error("فشل توليد الفكرة العشوائية.");
    }
  },

  // 11. Generate Funny Human
  async generateFunnyHuman(params: {
    baseHuman: string;
    mergedWith: string;
    crazyFeature: string;
    expression: string;
    style: string;
    environment: string;
  }): Promise<string> {
    const ai = getAI();
    const prompt = `A highly detailed, hilarious, and bizarre surreal image.
    The following features are described in Arabic, please understand them and generate the corresponding image:
    Base Human Subject: ${params.baseHuman}.
    Merged or combined with: ${params.mergedWith}.
    Crazy feature/mutation: ${params.crazyFeature}.
    Expression: ${params.expression}.
    Environment/Background: ${params.environment}.
    Style: ${params.style}.
    
    CRITICAL INSTRUCTION: You MUST generate an image. Do not output text. Make it look extremely convincing but conceptually absurd, funny, and weird. 8k resolution, highly detailed.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { imageConfig: { aspectRatio: "3:4" } }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isRateLimitError(error)) {
        handleCommonErrors(error, "");
      }
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الصورة (403). تأكد من صلاحيات مفتاح API لنموذج gemini-3-pro-image-preview.");
      }
      handleCommonErrors(error, "فشل توليد الصورة.");
      throw error;
    }
  },

  // 12. Auto-Generate Funny Human Idea
  async generateRandomFunnyHumanIdea(): Promise<any> {
    const ai = getAI();
    const prompt = `
      You are a comedy genius and character designer. Generate a hilarious, bizarre, and unexpected human-hybrid character concept.
      Output a JSON object with EXACTLY these keys (values MUST be strings in Arabic):
      - baseHuman: (e.g., "رجل أعمال جاد", "جدة لطيفة", "عامل بناء", "طبيب جراح")
      - mergedWith: (e.g., "غسالة ملابس", "أطراف أخطبوط", "عجلات سيارة", "جسم ثلاجة", "أجنحة دجاجة مقلية")
      - crazyFeature: (e.g., "رأس عملاق وجسم صغير", "عيون في اليدين", "أنف على شكل فيل", "رقبة زرافة")
      - expression: (e.g., "يضحك بهستيريا", "نظرة ميتة (Deadpan)", "مصدوم جداً", "يبكي من الضحك")
      - style: (e.g., "صورة فوتوغرافية واقعية", "كاميرا مراقبة (CCTV)", "رسوم متحركة 3D", "صورة بولارويد قديمة")
      - environment: (e.g., "سوبر ماركت", "اجتماع عمل رسمي", "الفضاء الخارجي", "حمام سباحة")
    `;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              baseHuman: { type: Type.STRING },
              mergedWith: { type: Type.STRING },
              crazyFeature: { type: Type.STRING },
              expression: { type: Type.STRING },
              style: { type: Type.STRING },
              environment: { type: Type.STRING }
            }
          }
        }
      });

      const text = result.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error("Auto-generate error:", error);
      throw new Error("فشل توليد الفكرة العشوائية.");
    }
  },

  // 13. Generate YouTube Thumbnail
  async generateThumbnail(params: {
    title: string;
    style: string;
    elements: string;
    background: string;
    referenceImages?: { name: string; dataUrl: string }[];
    elementImages?: { name: string; dataUrl: string }[];
    baseThumbnail?: string;
    imageText?: string;
    // New parameters
    facialExpression?: string;
    eyeExpression?: string;
    headShape?: string;
    bodyShape?: string;
    eyeColor?: string;
    emotion?: string;
    bodyPose?: string;
    channelNiche?: string;
    videoType?: string;
    brandColors?: string;
    aspectRatio?: string;
  }): Promise<string> {
    const ai = getAI();
    
    // Parse aspect ratio
    let parsedAspectRatio: "16:9" | "9:16" | "1:1" | "3:4" | "4:3" | "any" = "16:9";
    if (params.aspectRatio) {
      if (params.aspectRatio.includes("16:9")) parsedAspectRatio = "16:9";
      else if (params.aspectRatio.includes("9:16")) parsedAspectRatio = "9:16";
      else if (params.aspectRatio.includes("1:1")) parsedAspectRatio = "1:1";
      else if (params.aspectRatio.includes("4:3")) parsedAspectRatio = "4:3";
    }

    let prompt = "";
    if (params.baseThumbnail) {
      prompt = `You are an expert YouTube thumbnail designer. I have provided a base thumbnail image. Your task is to ENHANCE, REMIX, and UPGRADE it to make it highly professional, clickbaity, and viral.
      Style/Vibe: ${params.style}.
      ${params.elements ? `Add these elements: ${params.elements}.` : ''}
      ${params.brandColors ? `Use these brand colors prominently: ${params.brandColors}.` : ''}
      
      CRITICAL INSTRUCTIONS:
      - Aspect ratio MUST be ${parsedAspectRatio}.
      - Upgrade the lighting to cinematic 8k resolution, vibrant colors, and high contrast.
      - If reference characters are provided, REPLACE the main person/subject in the base thumbnail with the provided reference character. Match the lighting and perspective seamlessly.
      ${params.imageText ? `- REPLACE any existing text in the base thumbnail with this exact text: "${params.imageText}". Render it prominently in bold, 3D, highly readable YouTube thumbnail typography.` : '- Keep the visual composition but upgrade the quality.'}
      `;
    } else {
      prompt = `Create a highly engaging, clickbait-style YouTube thumbnail.
      
      --- Channel & Video Context ---
      ${params.channelNiche ? `Channel Niche: ${params.channelNiche}` : ''}
      ${params.videoType ? `Video Type: ${params.videoType}` : ''}
      ${params.title ? `Video Title/Idea: "${params.title}"` : ''}
      
      --- Design & Style ---
      Style/Vibe: ${params.style}.
      ${params.brandColors ? `Brand Colors: ${params.brandColors}` : ''}
      Background/Environment: ${params.background}.
      Main Elements/Objects: ${params.elements}.
      
      --- Character Details (if applicable) ---
      ${params.facialExpression ? `Facial Expression: ${params.facialExpression}` : ''}
      ${params.eyeExpression ? `Eye Expression: ${params.eyeExpression}` : ''}
      ${params.headShape ? `Head Shape: ${params.headShape}` : ''}
      ${params.bodyShape ? `Body Shape: ${params.bodyShape}` : ''}
      ${params.eyeColor ? `Eye Color: ${params.eyeColor}` : ''}
      ${params.emotion ? `Overall Emotion: ${params.emotion}` : ''}
      ${params.bodyPose ? `Body Pose: ${params.bodyPose}` : ''}
      
      CRITICAL INSTRUCTIONS: 
      - Aspect ratio MUST be ${parsedAspectRatio}.
      - High contrast, vibrant colors, clear focal point, extremely eye-catching.
      - If reference images are provided, use them as the main characters/subjects in the thumbnail. Pay attention to their names if specified in the prompt. Apply the Character Details (pose, expression, etc.) to them.
      - If element images are provided, incorporate those specific items into the scene.
      ${params.imageText ? `- Render this exact text prominently in the image: "${params.imageText}". Use bold, 3D, highly readable YouTube thumbnail typography.` : '- Do not output actual text/words unless it\'s a natural part of the environment. Focus on the visual storytelling.'}
      - 8k resolution, highly detailed, cinematic lighting.`;
    }

    const parts: any[] = [{ text: prompt }];
    
    // Add base thumbnail if enhancing
    if (params.baseThumbnail) {
      parts.push({ text: "\n--- Base Thumbnail to Enhance/Remix ---" });
      const base64Data = params.baseThumbnail.includes(',') ? params.baseThumbnail.split(',')[1] : params.baseThumbnail;
      parts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
    }

    // Add character reference images
    if (params.referenceImages && params.referenceImages.length > 0) {
      parts.push({ text: "\n--- Reference Characters ---" });
      params.referenceImages.forEach(img => {
        parts.push({ text: `Character Name: ${img.name}` });
        const base64Data = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
        parts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
      });
    }

    // Add element reference images
    if (params.elementImages && params.elementImages.length > 0) {
      parts.push({ text: "\n--- Reference Elements ---" });
      params.elementImages.forEach(img => {
        parts.push({ text: `Element Name: ${img.name}` });
        const base64Data = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
        parts.push({ inlineData: { mimeType: "image/png", data: base64Data } });
      });
    }

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts }],
        config: { imageConfig: { aspectRatio: parsedAspectRatio } }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isRateLimitError(error)) {
        handleCommonErrors(error, "");
      }
      if (isPermissionError(error)) {
        throw new Error("فشل توليد الصورة المصغرة (403). تأكد من صلاحيات مفتاح API لنموذج gemini-3-pro-image-preview.");
      }
      handleCommonErrors(error, "فشل توليد الصورة المصغرة.");
      throw error;
    }
  },

  // 14. Analyze Thumbnail
  async analyzeThumbnail(imageBase64: string): Promise<{
    critique: string;
    suggestedElements: string;
    suggestedText: string;
    suggestedStyle: string;
  }> {
    try {
      const ai = getAI();
      const prompt = `
        Analyze this YouTube thumbnail.
        Output a JSON object with EXACTLY these keys (values MUST be strings in Arabic):
        - critique: A brief critique of the current thumbnail.
        - suggestedElements: Specific visual elements to add (e.g., "أسهم حمراء، إضاءة نيون").
        - suggestedText: A short clickbait text to put on the thumbnail (e.g., "لن تصدق ما حدث!").
        - suggestedStyle: The overall art style (e.g., "MrBeast (ألوان فاقعة، تباين عالي)").
      `;

      const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const mimeType = imageBase64.includes(',') ? imageBase64.substring(imageBase64.indexOf(':') + 1, imageBase64.indexOf(';')) : "image/jpeg";

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              critique: { type: Type.STRING },
              suggestedElements: { type: Type.STRING },
              suggestedText: { type: Type.STRING },
              suggestedStyle: { type: Type.STRING }
            }
          }
        }
      });

      const text = result.text || "{}";
      const jsonString = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error("Thumbnail analysis error:", error);
      // Return a fallback object instead of throwing to prevent the UI from getting stuck
      return {
        critique: "لم نتمكن من تحليل الصورة بدقة، لكن يمكنك تحسينها بإضافة ألوان زاهية وتباين عالي.",
        suggestedElements: "أسهم حمراء، دوائر تحديد، إضاءة نيون",
        suggestedText: "السر الذي يخفونه عنك!",
        suggestedStyle: "MrBeast (ألوان فاقعة، تباين عالي، تعابير مبالغ فيها)"
      };
    }
  },

  // 15. Generate Character Animation - uses referenceImages for character consistency
  async generateCharacterAnimation(params: {
    characters: {
      name: string;
      visualTraits: string;
      images: { front?: string; back?: string; closeup?: string; left?: string; right?: string; threeQuarter?: string; reference?: string; normal?: string; surreal?: string };
    }[];
    prompt: string;
    aspectRatio: "16:9" | "9:16";
    resolution?: '720p' | '1080p';
  }): Promise<string> {
    const ai = getAI();
    const { characters, prompt, aspectRatio, resolution = '1080p' } = params;

    // Collect one image per character (up to 3 total for Veo limit)
    const charImages: string[] = [];
    for (const char of characters) {
      const imgs = char.images as Record<string, string | undefined>;
      for (const value of Object.values(imgs)) {
        if (value && typeof value === 'string' && value.length > 100) {
          charImages.push(value);
          break; // one per character
        }
      }
    }
    if (charImages.length === 0) {
      throw new Error("لا توجد صور مرجعية كافية. يجب ان تحتوي الشخصية على صورة واحدة على الاقل.");
    }

    // Compress images using canvas
    const compressImage = (imgBase64: string): Promise<{ data: string; mimeType: string }> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          const maxDim = 1024;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.onerror = () => {
          const data = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
          resolve({ data, mimeType: 'image/png' });
        };
        img.src = imgBase64.startsWith('data:') ? imgBase64 : `data:image/png;base64,${imgBase64}`;
      });
    };

    // Compress all character images
    const compressed = await Promise.all(charImages.slice(0, 3).map(compressImage));

    // Build prompt with detailed character descriptions
    const charDesc = characters.map((c, i) => {
      const label = characters.length > 1 ? `Character ${i + 1}` : 'The character';
      return `${label}: ${c.visualTraits || c.name}. MUST match the provided reference image exactly.`;
    }).join('\n');

    const sanitizedPrompt = prompt
      .replace(/رعب|horror|scary/gi, 'dramatic')
      .replace(/عنف|violence/gi, 'action')
      .replace(/دم|blood/gi, 'dramatic')
      .replace(/قتل|kill/gi, 'conflict')
      .replace(/موت|death/gi, 'dramatic moment');

    const enhancedPrompt = `${charDesc}\n\nIMPORTANT: Each character MUST exactly match their provided reference image - same face, body, clothing, colors.\n\n${sanitizedPrompt}`;

    // Build referenceImages array for Veo 3.1
    const referenceImages = compressed.map(img => ({
      image: { imageBytes: img.data, mimeType: img.mimeType },
      referenceType: 'REFERENCE_TYPE_SUBJECT',
    }));

    // Download helper
    const downloadVideo = async (uri: string): Promise<string> => {
      const storedKey = localStorage.getItem('GEMINI_API_KEY');
      const apiKey = storedKey || process.env.GEMINI_API_KEY;
      const resp = await fetch(uri, { headers: { 'x-goog-api-key': apiKey || '' } });
      if (!resp.ok) throw new Error("فشل تحميل الفيديو المولد.");
      const blob = await resp.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    // Poll helper
    const poll = async (op: any) => {
      let count = 0;
      while (!op.done && count < 60) {
        await new Promise(r => setTimeout(r, 10000));
        op = await ai.operations.getVideosOperation({ operation: op });
        count++;
        console.log(`Poll ${count}: done=${op.done}`);
      }
      return op;
    };

    try {
      console.log(`Video gen: ${charImages.length} ref images, aspect=${aspectRatio}, res=${resolution}`);

      // Try with referenceImages first (character as reference, not start frame)
      try {
        let operation = await ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt: enhancedPrompt,
          config: {
            numberOfVideos: 1,
            referenceImages,
            resolution,
            aspectRatio,
          }
        });
        operation = await poll(operation);
        const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (uri) return await downloadVideo(uri);
        throw new Error("no_uri");
      } catch (refErr: any) {
        console.warn('referenceImages failed:', refErr?.message);
        // Fallback to start frame with first image only if INVALID_ARGUMENT
        if (refErr?.message?.includes('INVALID_ARGUMENT') || refErr?.message?.includes('not supported') || refErr?.message === 'no_uri') {
          console.log('Falling back to start frame approach...');
          let operation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: enhancedPrompt,
            image: { imageBytes: compressed[0].data, mimeType: compressed[0].mimeType },
            config: {
              numberOfVideos: 1,
              resolution,
              aspectRatio,
            }
          });
          operation = await poll(operation);
          const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
          if (!uri) throw new Error("تم حظر المحتوى بسبب سياسات الأمان. جرب وصفاً مختلفاً.");
          return await downloadVideo(uri);
        }
        throw refErr;
      }

    } catch (error: any) {
      console.error('Veo error:', error);
      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) throw new Error("فشل التحريك (403). تأكد من صلاحيات مفتاح API.");
      handleCommonErrors(error, `فشل التحريك: ${error?.message || 'خطأ غير معروف'}`);
      throw error;
    }
  },

  // 15.5 Generate Video Idea from Characters (auto or enhance manual)
  async generateVideoIdeaFromCharacters(params: {
    characters: { name: string; description: string; visualTraits: string }[];
    videoType: string;
    dialogueLanguage: string;
    manualIdea?: string;
  }): Promise<{
    title: string;
    prompt: string;
    scenes: string[];
    cameraMovements: string[];
    mood: string;
    dialogueSuggestion: string;
  }> {
    const ai = getAI();
    const { characters, videoType, dialogueLanguage, manualIdea } = params;
    const charsDesc = characters.map((c, i) => `- Character ${i + 1} (${c.name}): ${c.description}. Visual: ${c.visualTraits}`).join('\n');

    const isEnhance = manualIdea && manualIdea.trim().length > 0;

    const videoTypeDirections: Record<string, string> = {
      funny: 'Comedic timing, exaggerated facial expressions, physical comedy beats, surprised reactions, comedic pauses. Light-hearted color grading with warm tones.',
      sad: 'Emotional slow movements, contemplative gazes, single tear moments, dramatic shallow depth of field. Desaturated cool color grading with blue undertones.',
      action: 'Fast dynamic movements, intense facial expressions, dramatic camera swoops, motion blur on quick actions. High-contrast color grading with teal and orange.',
      romantic: 'Soft gentle movements, warm eye contact, slow-motion hair movement, intimate close-ups. Warm golden-hour color grading with soft highlights.',
      mystery: 'Mysterious atmosphere, suspenseful slow movements, dramatic shadows, intriguing reveals. Moody cinematic grading with deep shadows and cool undertones.',
      horror: 'Mysterious atmosphere, suspenseful slow movements, dramatic shadows, intriguing reveals. Moody cinematic grading with deep shadows and cool undertones.',
      educational: 'Clear purposeful gestures, direct-to-camera address, well-lit demonstration angles. Clean bright color grading with neutral tones.',
      dramatic: 'Intense emotional performances, meaningful pauses, dramatic lighting shifts, powerful silhouettes. Rich cinematic color grading with deep shadows.',
      inspirational: 'Uplifting movements, confident posture, warm natural light, sunrise/sunset atmosphere. Warm vibrant color grading with golden highlights.',
    };

    const textPrompt = `You are an elite AI video director with expertise in Veo 3.1 prompt engineering for maximum character consistency.

CHARACTER BIBLE (these descriptions MUST be repeated exactly in the prompt):
${charsDesc}

VIDEO PARAMETERS:
- Type: ${videoType}
- Dialogue Language: ${dialogueLanguage}
- Characters will be provided as REFERENCE IMAGES to Veo 3.1's "Ingredients to Video" system

${isEnhance ? `USER'S ORIGINAL IDEA:\n"${manualIdea}"\n\nYour job: Enhance this idea into a professional Veo 3.1 prompt. Keep the core concept but make it extremely cinematic and optimized for AI video generation with perfect character consistency.` : `Generate a completely new, creative ${videoType} video idea for these characters.`}

CRITICAL PROMPT ENGINEERING RULES FOR CHARACTER CONSISTENCY:
You MUST follow the Veo 3.1 five-part formula: [Cinematography] + [Subject] + [Action] + [Context] + [Style & Audio]

1. IDENTITY ANCHORING (most important):
   - Start the prompt by describing EXACTLY what each character looks like using their visual traits
   ${characters.length > 1 ? `- For multiple characters: "The first character, a [exact visual description from bible], and the second character, a [exact visual description from bible]..."` : `- "The character, a [exact visual description from bible]..."`}
   - Include: face shape, skin tone, hair color/style/length, eye color, clothing (exact items, colors, materials), body proportions, age range
   - Add: "maintaining exact appearance as shown in the reference images"
   - NEVER use character names in the prompt - only visual descriptions

2. CINEMATOGRAPHY:
   - Specify exact lens (e.g., "35mm lens", "85mm portrait lens", "24mm wide angle")
   - Specify camera movement (e.g., "slow dolly forward", "orbiting steadicam shot", "locked tripod medium shot")
   - Specify shot type (e.g., "medium close-up", "full body wide shot", "over-the-shoulder")

3. ACTION & PERFORMANCE:
   - ${videoTypeDirections[videoType] || 'Match the mood appropriately with specific movement descriptions.'}
   - Describe micro-expressions and body language in detail

4. ENVIRONMENT & LIGHTING:
   - Describe the setting precisely (materials, colors, props, depth)
   - Specify lighting setup (e.g., "warm key light from the left, soft fill from above, practical lights in background")
   - Color grading direction

5. AUDIO & DIALOGUE:
   - If dialogue: specify voice characteristics (tone, pace, emotion) in ${dialogueLanguage}
   - Ambient sound design (e.g., "distant city traffic", "quiet room tone with clock ticking")
   - Music mood if applicable

Output a JSON object:
- "title": Catchy Arabic title for the video
- "prompt": Extremely detailed English prompt for Veo 3.1 (400+ words). MUST start with character visual description anchoring, then follow the five-part formula. Include lens, camera movement, exact lighting, environment details, action beats, and audio direction.
- "scenes": Array of 3-5 scene breakdown descriptions in Arabic
- "cameraMovements": Array of specific camera movements in Arabic with technical details
- "mood": Overall mood/atmosphere description in Arabic
- "dialogueSuggestion": Suggested dialogue lines in ${dialogueLanguage} with character emotion directions`;

    try {
      const result = await withRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: textPrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              prompt: { type: Type.STRING },
              scenes: { type: Type.ARRAY, items: { type: Type.STRING } },
              cameraMovements: { type: Type.ARRAY, items: { type: Type.STRING } },
              mood: { type: Type.STRING },
              dialogueSuggestion: { type: Type.STRING },
            },
            required: ["title", "prompt", "scenes", "cameraMovements", "mood", "dialogueSuggestion"]
          }
        }
      }));
      const text = result.text;
      if (!text) throw new Error("لم يتم استلام رد من النموذج. حاول مرة اخرى.");
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(jsonString);
      if (!parsed.prompt || !parsed.title) throw new Error("الرد من النموذج غير مكتمل. حاول مرة اخرى.");
      return parsed;
    } catch (error: any) {
      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) throw new Error("فشل توليد الفكرة (403). تاكد من صلاحيات المفتاح.");
      if (error instanceof SyntaxError) throw new Error("فشل تحليل رد النموذج. حاول مرة اخرى.");
      handleCommonErrors(error, `فشل توليد فكرة الفيديو: ${error?.message || 'خطأ غير معروف'}`);
      throw error;
    }
  },

  // 16. Generate Product Shot
  async generateProductShot(params: { product: string; background: string; lighting: string; style: string }): Promise<string> {
    const ai = getAI();
    const prompt = `High-end commercial product photography of: ${params.product}.
    Background/Environment: ${params.background}.
    Lighting: ${params.lighting}.
    Style/Vibe: ${params.style}.
    
    CRITICAL INSTRUCTIONS: 
    - This must look like a professional, award-winning advertising campaign shot.
    - Photorealistic, 8k resolution, extremely sharp focus on the product.
    - Perfect composition and color grading.`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) throw new Error("فشل توليد الصورة (403). تأكد من صلاحيات مفتاح API.");
      handleCommonErrors(error, "فشل تصوير المنتج.");
      throw error;
    }
  },

  // 17. Generate Brand Identity
  async generateBrandIdentity(description: string): Promise<{ names: string[], slogan: string, colors: string[], typography: string, moodboardImage: string }> {
    const ai = getAI();
    
    try {
      // 1. Generate Brand Strategy
      const textPrompt = `You are an expert Brand Strategist and Art Director.
      Create a brand identity concept for the following project/business: "${description}".
      
      Output a JSON object with EXACTLY these keys:
      - "names": Array of 3 creative brand name ideas (in Arabic).
      - "slogan": A catchy, short slogan (in Arabic).
      - "colors": Array of 3-4 hex color codes (e.g., ["#FF0000", "#00FF00"]) that fit the brand psychology.
      - "typography": Suggested font style description (in Arabic, e.g., "خط كوفي حديث وزوايا حادة").
      - "moodboardPrompt": A highly detailed image generation prompt (in English) to create an aesthetic moodboard for this brand. It should include the color palette, textures, lifestyle elements, packaging style, and overall vibe.`;

      const textResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: textPrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              names: { type: Type.ARRAY, items: { type: Type.STRING } },
              slogan: { type: Type.STRING },
              colors: { type: Type.ARRAY, items: { type: Type.STRING } },
              typography: { type: Type.STRING },
              moodboardPrompt: { type: Type.STRING }
            }
          }
        }
      });

      const text = textResult.text || "{}";
      const jsonString = text.replace(/```json\n?|\n?```/g, "").trim();
      const brandData = JSON.parse(jsonString);

      // 2. Generate Moodboard Image
      const imagePrompt = `A professional brand identity moodboard. ${brandData.moodboardPrompt}. 
      Layout: A beautiful collage of textures, color swatches, lifestyle photography, and abstract shapes representing the brand. 
      Style: Minimalist, highly aesthetic, Pinterest style, 8k resolution, photorealistic.`;
      
      const imageResult = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
        config: { imageConfig: { aspectRatio: "16:9" } }
      });
      
      const moodboardImage = extractImage(imageResult);

      return {
        names: brandData.names || ["علامة تجارية 1", "علامة تجارية 2"],
        slogan: brandData.slogan || "شعار مميز لعلامتك",
        colors: brandData.colors || ["#000000", "#FFFFFF", "#CCCCCC"],
        typography: brandData.typography || "خط حديث وبسيط",
        moodboardImage: moodboardImage
      };

    } catch (error: any) {
      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) throw new Error("فشل التوليد (403). تأكد من صلاحيات مفتاح API.");
      handleCommonErrors(error, "فشل بناء الهوية البصرية.");
      throw error;
    }
  },

  // 18. Improve Ad Copy
  async improveAdCopy(topic: string, industry: string): Promise<{ largeText: string, smallText: string }> {
    const ai = getAI();
    const prompt = `أنت خبير تسويق وكتابة إعلانات (Copywriter).
    لدي إعلان عن: "${topic}"
    في مجال/صناعة: "${industry}"
    
    اكتب لي:
    1. عنوان رئيسي جذاب وقصير جد��ً (largeText)
    2. نص فرعي أو وصف مشوق وقصير (smallText)
    
    يجب أن يكون الرد بصيغة JSON فقط يحتوي على المفتاحين largeText و smallText.`;
    
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              largeText: { type: Type.STRING },
              smallText: { type: Type.STRING }
            }
          }
        }
      });
      
      const text = result.text || "{}";
      const jsonString = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      return JSON.parse(jsonString);
    } catch (error: any) {
      console.error("Copywriting error:", error);
      throw new Error("فشل تحسين النص الإعلاني.");
    }
  },

  // 19. Generate Ad Poster
  async generateAdPoster(params: { 
    topic: string; 
    brandName: string; 
    industry?: string;
    primaryColor: string; 
    secondaryColor: string; 
    visualStyle: string;
    largeText?: string;
    smallText?: string;
    phoneNumber?: string;
    logoBase64?: string;
    elementsPosition?: string;
    language?: string;
    fontType?: string;
    textColor?: string;
    textStyle?: string;
    aspectRatio?: string;
    imageSize?: string;
    extraImageBase64?: string;
    characterImageBase64?: string;
  }): Promise<string> {
    const ai = getAI();
    let prompt = `You are an award-winning Art Director and Master Graphic Designer creating a mind-blowing, highly creative social media advertising poster.
    
    Topic/Subject of the ad: "${params.topic}".
    Brand Name: "${params.brandName}".`;
    
    if (params.industry) prompt += `\nIndustry/Niche: "${params.industry}". Think outside the box. Use clever visual metaphors, surrealism, or hyper-realistic 3D elements relevant to this industry (e.g., if it's dental, maybe a tooth shining like a diamond or a tooth acting as a washing machine; if it's internet, a turtle on a rocket skateboard).`;
    
    prompt += `\n
    Design Requirements:
    - Visual Style: ${params.visualStyle}.
    - Color Palette: Dominant primary color (${params.primaryColor}) and accent secondary color (${params.secondaryColor}). Use dramatic, studio-quality lighting (volumetric lighting, rim lights) to make the colors pop.
    - Concept: Create a striking, out-of-the-box visual metaphor or a highly engaging composition (like top-tier Behance or Pinterest ad designs).
    - Composition: Perfect social media post layout with clear visual hierarchy. Leave strategic negative space for text.
    - Quality: 8k resolution, hyper-realistic textures, flawless photo manipulation or top-tier 3D rendering, masterpiece, trending on ArtStation and Behance.`;

    if (params.largeText || params.smallText || params.phoneNumber || params.logoBase64) {
      prompt += `\n\nText and Logo Elements to include (render them clearly if possible, or leave space for them):`;
      if (params.language) prompt += `\n- Language for text: ${params.language}`;
      if (params.fontType) prompt += `\n- Typography/Font Style: ${params.fontType}`;
      if (params.textColor) prompt += `\n- Text Color: ${params.textColor}`;
      if (params.textStyle) prompt += `\n- Text Effect/Material: ${params.textStyle}`;
      if (params.elementsPosition) prompt += `\n- Preferred Position for these elements: ${params.elementsPosition}`;
      if (params.largeText) prompt += `\n- Main Headline: "${params.largeText}"`;
      if (params.smallText) prompt += `\n- Subtext/Description: "${params.smallText}"`;
      if (params.phoneNumber) prompt += `\n- Contact/Phone: "${params.phoneNumber}"`;
    } else {
      prompt += `\n\nDo not include actual readable text, just the visual composition and elements, leaving negative space for text.`;
    }

    if (params.logoBase64) {
      prompt += `\n\nIncorporate the provided logo image naturally into the design, preferably at the specified position (${params.elementsPosition || 'a suitable corner'}).`;
    }
    if (params.extraImageBase64) {
      prompt += `\n\nIncorporate the provided extra image (e.g., product, tool, or specific element) naturally into the scene.`;
    }
    if (params.characterImageBase64) {
      prompt += `\n\nIncorporate the provided character image naturally into the scene as the main actor, mascot, or presenter for the ad.`;
    }

    const parts: any[] = [{ text: prompt }];

    if (params.logoBase64) {
      const base64Data = params.logoBase64.includes(',') ? params.logoBase64.split(',')[1] : params.logoBase64;
      const mimeType = params.logoBase64.includes(',') ? params.logoBase64.substring(params.logoBase64.indexOf(':') + 1, params.logoBase64.indexOf(';')) : "image/png";
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }
    if (params.extraImageBase64) {
      const base64Data = params.extraImageBase64.includes(',') ? params.extraImageBase64.split(',')[1] : params.extraImageBase64;
      const mimeType = params.extraImageBase64.includes(',') ? params.extraImageBase64.substring(params.extraImageBase64.indexOf(':') + 1, params.extraImageBase64.indexOf(';')) : "image/png";
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }
    if (params.characterImageBase64) {
      const base64Data = params.characterImageBase64.includes(',') ? params.characterImageBase64.split(',')[1] : params.characterImageBase64;
      const mimeType = params.characterImageBase64.includes(',') ? params.characterImageBase64.substring(params.characterImageBase64.indexOf(':') + 1, params.characterImageBase64.indexOf(';')) : "image/png";
      parts.push({ inlineData: { mimeType, data: base64Data } });
    }

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts }],
        config: { 
          imageConfig: { 
            aspectRatio: params.aspectRatio || "3:4",
            imageSize: params.imageSize || "2K"
          } 
        }
      });
      return extractImage(result);
    } catch (error: any) {
      if (isRateLimitError(error)) handleCommonErrors(error, "");
      if (isPermissionError(error)) throw new Error("فشل توليد الإعلان (403). تأكد من صلاحيات مفتاح API.");
      handleCommonErrors(error, "فشل تصميم الإعلان.");
      throw error;
    }
  },

  // Character Sheet Generation - Create multiple views from a reference image
  async generateCharacterSheet(params: {
    referenceImage: string;
    characterType: 'human' | 'animal' | 'object' | 'fantasy';
    characterName: string;
    onProgress?: (progress: number) => void;
  }): Promise<{ front: string; back: string; closeup: string }> {
    const ai = getAI();
    const { referenceImage, characterType, characterName, onProgress } = params;

    const typeDescriptions: Record<string, string> = {
      human: 'a human person/child',
      animal: 'an animal/creature',
      object: 'an object/item',
      fantasy: 'a fantasy/fictional character'
    };

    const typeDesc = typeDescriptions[characterType] || 'a character';
    
    // Extract base64 from data URL
    const base64Match = referenceImage.match(/^data:image\/\w+;base64,(.+)$/);
    const imageData = base64Match ? base64Match[1] : referenceImage;
    const mimeType = referenceImage.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';

    const results: { front: string; back: string; closeup: string } = {
      front: '',
      back: '',
      closeup: ''
    };

    // Generate Front View
    onProgress?.(10);
    console.log('Generating front view...');
    
    const frontPrompt = `Based on the reference image of ${typeDesc} named "${characterName}", generate a HIGH QUALITY full-body front view.
    
IMPORTANT REQUIREMENTS:
- EXACT same face/features as the reference image - preserve all facial details precisely
- Full body visible from head to toe
- Front-facing pose, looking at camera
- Same clothing style and colors if visible in reference
- Clean white background
- Professional photography style lighting
- High resolution, 4K quality
- Natural proportions and realistic body

The character should be instantly recognizable as the same ${typeDesc} from the reference.`;

    try {
      const frontResult = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageData } },
              { text: frontPrompt }
            ]
          }
        ],
        config: {
          responseModalities: ["image", "text"],
          temperature: 0.7,
        }
      });
      results.front = extractImage(frontResult);
      console.log('Front view generated successfully');
    } catch (error: any) {
      console.error('Front view error:', error);
      throw new Error(`فشل توليد الصورة الأمامية: ${error.message}`);
    }

    onProgress?.(40);

    // Generate Back View
    console.log('Generating back view...');
    
    const backPrompt = `Based on the reference image of ${typeDesc} named "${characterName}", generate a HIGH QUALITY full-body BACK view.
    
IMPORTANT REQUIREMENTS:
- Same character as the reference - same body type, hair style, clothing
- Full body visible from head to toe
- Character facing AWAY from camera (back view)
- Same clothing from the back perspective
- Clean white background
- Professional photography style lighting
- High resolution, 4K quality
- Natural proportions

Show the back of the character with consistent details (hair, clothing, body shape).`;

    try {
      const backResult = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageData } },
              { inlineData: { mimeType: 'image/png', data: results.front.split(',')[1] } },
              { text: backPrompt }
            ]
          }
        ],
        config: {
          responseModalities: ["image", "text"],
          temperature: 0.7,
        }
      });
      results.back = extractImage(backResult);
      console.log('Back view generated successfully');
    } catch (error: any) {
      console.error('Back view error:', error);
      throw new Error(`فشل توليد الصورة الخلفية: ${error.message}`);
    }

    onProgress?.(70);

    // Generate Closeup View
    console.log('Generating closeup view...');
    
    const closeupPrompt = `Based on the reference image of ${typeDesc} named "${characterName}", generate a HIGH QUALITY closeup portrait.
    
IMPORTANT REQUIREMENTS:
- EXACT same face/features as the reference image - this is critical
- Close-up of face and upper shoulders only
- Slightly tilted or angled pose for visual interest (like looking up or 3/4 view)
- Same facial features, eyes, nose, mouth - perfectly preserved
- Clean white background
- Soft professional lighting
- High resolution, 4K quality
- Show personality in the expression

The face must be IDENTICAL to the reference - same eyes, nose, mouth, skin tone, hair.`;

    try {
      const closeupResult = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageData } },
              { inlineData: { mimeType: 'image/png', data: results.front.split(',')[1] } },
              { text: closeupPrompt }
            ]
          }
        ],
        config: {
          responseModalities: ["image", "text"],
          temperature: 0.7,
        }
      });
      results.closeup = extractImage(closeupResult);
      console.log('Closeup view generated successfully');
    } catch (error: any) {
      console.error('Closeup view error:', error);
      throw new Error(`فشل توليد صورة الوجه: ${error.message}`);
    }

    onProgress?.(100);
    return results;
  },

  // Regenerate a single view
  async regenerateCharacterView(params: {
    referenceImage: string;
    existingImages: { front: string; back: string; closeup: string };
    viewToRegenerate: 'front' | 'back' | 'closeup';
    characterType: 'human' | 'animal' | 'object' | 'fantasy';
    characterName: string;
  }): Promise<string> {
    const ai = getAI();
    const { referenceImage, existingImages, viewToRegenerate, characterType, characterName } = params;

    const typeDescriptions: Record<string, string> = {
      human: 'a human person/child',
      animal: 'an animal/creature', 
      object: 'an object/item',
      fantasy: 'a fantasy/fictional character'
    };

    const typeDesc = typeDescriptions[characterType] || 'a character';
    
    const base64Match = referenceImage.match(/^data:image\/\w+;base64,(.+)$/);
    const imageData = base64Match ? base64Match[1] : referenceImage;
    const mimeType = referenceImage.match(/^data:(image\/\w+);/)?.[1] || 'image/jpeg';

    const prompts: Record<string, string> = {
      front: `Regenerate a HIGH QUALITY full-body front view of ${typeDesc} "${characterName}". Full body, front-facing, white background, same features as reference.`,
      back: `Regenerate a HIGH QUALITY full-body back view of ${typeDesc} "${characterName}". Full body from behind, white background, same clothing and body as reference.`,
      closeup: `Regenerate a HIGH QUALITY closeup portrait of ${typeDesc} "${characterName}". Face and shoulders, slightly angled pose, white background, EXACT same facial features.`
    };

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageData } },
              { text: prompts[viewToRegenerate] }
            ]
          }
        ],
        config: {
          responseModalities: ["image", "text"],
          temperature: 0.8,
        }
      });
      return extractImage(result);
    } catch (error: any) {
      handleCommonErrors(error, "فشل إعادة توليد الصورة.");
      throw error;
    }
  }
};

