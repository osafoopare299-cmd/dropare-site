export const runtime = "nodejs";

const MODEL = "gemini-2.5-flash";

function cleanJson(text="") {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No structured results returned");
  return JSON.parse(m[0]);
}

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) return Response.json({error:"Gemini is not configured."},{status:503});
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return Response.json({error:"No report supplied."},{status:400});
    if (file.size > 10 * 1024 * 1024) return Response.json({error:"Report must be 10 MB or smaller."},{status:413});
    const allowed = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!allowed) return Response.json({error:"Use a PDF or image report."},{status:415});
    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
    const prompt = `Extract laboratory RESULTS ONLY from this report. Do not diagnose. Return strict JSON:
{"results":[{"test":"canonical analyte name","value":number,"unit":"as printed","low":number|null,"high":number|null,"flag":"H|L|N|CRITICAL|","confidence":0.0}],"warnings":["..."]}
Use the reference interval printed beside each result. Never invent missing values/ranges. Ignore patient name, ID, address, phone, email and other identifiers. If uncertain, lower confidence and add a warning.`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({contents:[{parts:[{text:prompt},{inlineData:{mimeType:file.type,data:bytes}}]}],generationConfig:{temperature:0,responseMimeType:"application/json"}})
    });
    const data=await res.json();
    if(!res.ok) return Response.json({error:"Report extraction failed.",detail:data?.error?.message||"Gemini request failed"},{status:502});
    const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
    const parsed=cleanJson(text);
    return Response.json({results:Array.isArray(parsed.results)?parsed.results:[],warnings:Array.isArray(parsed.warnings)?parsed.warnings:[]});
  } catch(e){return Response.json({error:"Could not extract this report.",detail:e.message},{status:500})}
}
