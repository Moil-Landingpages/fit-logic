"use strict";(()=>{var e={};e.id=20,e.ids=[20],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},13115:(e,t,i)=>{i.r(t),i.d(t,{originalPathname:()=>y,patchFetch:()=>h,requestAsyncStorage:()=>m,routeModule:()=>f,serverHooks:()=>g,staticGenerationAsyncStorage:()=>_});var a={};i.r(a),i.d(a,{POST:()=>d});var n=i(69132),r=i(40679),s=i(40417),o=i(42781),c=i(76793),l=i(64324);async function p(e,t,i,a,n){let r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${e}`},body:JSON.stringify({from:t,to:i,subject:a,html:n})});if(!r.ok)throw Error(`Resend error ${r.status}: ${await r.text()}`)}async function u(e,t,i,a,n){return p(e,t,i,a,n)}async function d(e){try{let{inquiry_id:t}=await e.json();if(!t)return o.NextResponse.json({error:"inquiry_id required"},{status:400});let i=(0,l.u)(),a=process.env.GEMINI_API_KEY;if(!a)return o.NextResponse.json({error:"GEMINI_API_KEY is not configured"},{status:500});let{data:n,error:r}=await i.from("inquiries").select("*").eq("id",t).single();if(r||!n)return o.NextResponse.json({error:"Inquiry not found"},{status:404});let[{data:s},{data:p}]=await Promise.all([i.from("practice_settings").select("email_provider_api_key, email_from_address, email_from_name, escalation_staff_id").limit(1).single(),i.from("faqs").select("*").eq("active",!0)]),d=process.env.RESEND_API_KEY??s?.email_provider_api_key??"",f=process.env.FROM_EMAIL??s?.email_from_address??"",m=s?.email_from_name??"FitLogic",_=m?`${m} <${f}>`:f,g=(p||[]).map((e,t)=>`${t+1}. Q: ${e.question}
   A: ${e.answer}
   Category: ${e.category}`).join("\n\n"),y=`You are an AI assistant for FitLogic, a functional medicine sales and client management platform. Analyze this incoming inquiry and:

1. Classify it into ONE category:
   - Appointment_Scheduling
   - Prescription_Lab_Requests
   - Health_Questions
   - Billing_Insurance
   - Urgent_Red_Flags
   - General_Info
2. Rate your confidence (0.0-1.0)
3. Check if it matches any FAQ below. If yes, provide the FAQ answer.
4. Determine if this needs human attention or can be auto-responded.

INQUIRY:
From: ${n.patient_name} (${n.patient_email||"no email"})
Source: ${n.source}
Content: ${n.raw_content}

AVAILABLE FAQs:
${g||"No FAQs configured yet."}

Respond in JSON format:
{
  "category": "one of the categories above",
  "confidence": 0.0-1.0,
  "is_faq_match": true/false,
  "auto_response": "the response text if FAQ match, or null",
  "needs_escalation": true/false,
  "reasoning": "brief explanation"
}`,h=new c.$D(a).getGenerativeModel({model:"gemini-3-flash-preview",systemInstruction:"You are a helpful inquiry classifier. Always respond with valid JSON only, no markdown.",generationConfig:{responseMimeType:"application/json"}}),E=await h.generateContent(y),I=E.response.candidates?.[0]?.content?.parts?.[0]?.text??"{}",q=JSON.parse(I),A={category:q.category||n.category,category_confidence:q.confidence??.5,is_faq_match:q.is_faq_match??!1},S=!1,w=null;if(q.is_faq_match&&q.auto_response&&n.patient_email&&!q.needs_escalation&&(A.response_text=q.auto_response,A.status="auto_responded",A.resolved_at=new Date().toISOString(),d&&f))try{let e=`<p>Hi ${n.patient_name??"there"},</p>
<p>${q.auto_response.replace(/\n/g,"<br>")}</p>
<p style="margin-top:24px;font-size:12px;color:#888;">This is an automated response from FitLogic.</p>`;await u(d,_,n.patient_email,"Re: Your inquiry to FitLogic",e),S=!0}catch(e){w=e instanceof Error?e.message:String(e),console.error("Auto-response email failed:",w)}if(q.needs_escalation&&(A.status="escalated",d&&f&&s?.escalation_staff_id)){let{data:e}=await i.from("staff").select("email, name").eq("id",s.escalation_staff_id).maybeSingle();if(e?.email)try{let t=`<p>Hi ${e.name??"there"},</p>
<p>A new inquiry requires your attention:</p>
<ul>
  <li><strong>From:</strong> ${n.patient_name} (${n.patient_email??"no email"})</li>
  <li><strong>Category:</strong> ${q.category}</li>
</ul>
<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#444;">
  ${String(n.raw_content).replace(/\n/g,"<br>")}
</blockquote>`;await u(d,_,e.email,`[FitLogic] Escalated inquiry from ${n.patient_name}`,t)}catch(e){console.error("Escalation notification failed:",e)}}let{error:v}=await i.from("inquiries").update(A).eq("id",t);if(v)throw v;return o.NextResponse.json({success:!0,classification:q,updates:A,emailSent:S,emailError:w})}catch(e){return o.NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400})}}let f=new n.AppRouteRouteModule({definition:{kind:r.x.APP_ROUTE,page:"/api/classify-inquiry/route",pathname:"/api/classify-inquiry",filename:"route",bundlePath:"app/api/classify-inquiry/route"},resolvedPagePath:"/dev-server/app/api/classify-inquiry/route.ts",nextConfigOutput:"",userland:a}),{requestAsyncStorage:m,staticGenerationAsyncStorage:_,serverHooks:g}=f,y="/api/classify-inquiry/route";function h(){return(0,s.patchFetch)({serverHooks:g,staticGenerationAsyncStorage:_})}},64324:(e,t,i)=>{i.d(t,{u:()=>o});var a=i(56754);let n="https://dqsdxrsfrsjnqisphwhs.supabase.co",r="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc2R4cnNmcnNqbnFpc3Bod2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDEwMDMsImV4cCI6MjA4OTA3NzAwM30.9AQBKNg60evk3-4go9KD7iN7N80FXPbsPSaPl5XK0FE",s=null;function o(){let e=process.env.SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY??"";if(!n||!e)throw Error("Server Supabase client is missing URL or SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.");return(0,a.eI)(n,e)}new Proxy({},{get(e,t){let i=function(){if(s)return s;if(!n||!r)throw Error("Supabase URL or publishable key is missing. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or VITE_* equivalents).");return s=(0,a.eI)(n,r,{auth:{storage:void 0,persistSession:!0,autoRefreshToken:!0}})}(),o=i[t];return"function"==typeof o?o.bind(i):o}})}};var t=require("../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),a=t.X(0,[766,365,754,793],()=>i(13115));module.exports=a})();