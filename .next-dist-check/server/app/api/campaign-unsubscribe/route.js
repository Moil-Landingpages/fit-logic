"use strict";(()=>{var e={};e.id=963,e.ids=[963],e.modules={20399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},50590:(e,t,i)=>{i.r(t),i.d(t,{originalPathname:()=>h,patchFetch:()=>b,requestAsyncStorage:()=>l,routeModule:()=>d,serverHooks:()=>g,staticGenerationAsyncStorage:()=>m});var n={};i.r(n),i.d(n,{GET:()=>c});var r=i(69132),a=i(40679),s=i(40417),o=i(42781),p=i(64324);async function c(e){let t=new URL(e.url).searchParams.get("t");if(!t)return new o.NextResponse(u("Missing tracking information.",!1),{headers:{"Content-Type":"text/html"},status:400});let i=(0,p.u)();try{let{data:e}=await i.from("campaign_send_log").select("recipient_id, campaign_id").eq("tracking_id",t).single();if(!e)return new o.NextResponse(u("Invalid or expired link.",!1),{headers:{"Content-Type":"text/html"},status:404});let{data:n}=await i.from("campaign_recipients").select("email").eq("id",e.recipient_id).single();if(!n?.email)return new o.NextResponse(u("Recipient not found.",!1),{headers:{"Content-Type":"text/html"},status:404});return await i.from("campaign_unsubscribes").upsert({email:n.email.toLowerCase(),campaign_id:e.campaign_id},{onConflict:"email"}),await i.from("campaign_recipients").update({status:"skipped",last_error:"Unsubscribed"}).eq("email",n.email).eq("campaign_id",e.campaign_id).eq("status","pending"),new o.NextResponse(u("You've been successfully unsubscribed. You will no longer receive emails from this campaign.",!0),{headers:{"Content-Type":"text/html"}})}catch(e){return console.error("campaign-unsubscribe error:",e),new o.NextResponse(u("Something went wrong. Please try again later.",!1),{headers:{"Content-Type":"text/html"},status:500})}}function u(e,t){return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t?"Unsubscribed":"Error"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f9fafb; color: #374151; }
    .card { background: white; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 12px; color: ${t?"#059669":"#dc2626"}; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${t?"✅":"⚠️"}</div>
    <h1>${t?"Unsubscribed":"Oops"}</h1>
    <p>${e}</p>
  </div>
</body>
</html>`}let d=new r.AppRouteRouteModule({definition:{kind:a.x.APP_ROUTE,page:"/api/campaign-unsubscribe/route",pathname:"/api/campaign-unsubscribe",filename:"route",bundlePath:"app/api/campaign-unsubscribe/route"},resolvedPagePath:"/dev-server/app/api/campaign-unsubscribe/route.ts",nextConfigOutput:"",userland:n}),{requestAsyncStorage:l,staticGenerationAsyncStorage:m,serverHooks:g}=d,h="/api/campaign-unsubscribe/route";function b(){return(0,s.patchFetch)({serverHooks:g,staticGenerationAsyncStorage:m})}},64324:(e,t,i)=>{i.d(t,{u:()=>o});var n=i(56754);let r="https://dqsdxrsfrsjnqisphwhs.supabase.co",a="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc2R4cnNmcnNqbnFpc3Bod2hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDEwMDMsImV4cCI6MjA4OTA3NzAwM30.9AQBKNg60evk3-4go9KD7iN7N80FXPbsPSaPl5XK0FE",s=null;function o(){let e=process.env.SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY??"";if(!r||!e)throw Error("Server Supabase client is missing URL or SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY.");return(0,n.eI)(r,e)}new Proxy({},{get(e,t){let i=function(){if(s)return s;if(!r||!a)throw Error("Supabase URL or publishable key is missing. Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or VITE_* equivalents).");return s=(0,n.eI)(r,a,{auth:{storage:void 0,persistSession:!0,autoRefreshToken:!0}})}(),o=i[t];return"function"==typeof o?o.bind(i):o}})}};var t=require("../../../webpack-runtime.js");t.C(e);var i=e=>t(t.s=e),n=t.X(0,[766,365,754],()=>i(50590));module.exports=n})();