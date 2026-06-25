(function(){
  var FN = "https://ssgwydumjovvjjusayeq.supabase.co/functions/v1";
  var NAV =
    '<header><nav class="wrap">'
    + '<a class="brand" href="/"><img src="/AppIcon-1024.png" alt="BarbellMind"/> BarbellMind</a>'
    + '<button class="nav-toggle" aria-label="Menu">&#9776;</button>'
    + '<div class="nav-links">'
      + '<a href="/features/" data-k="features">Features</a>'
      + '<a href="/ai-coach/" data-k="ai-coach">AI Coach</a>'
      + '<a href="/connect/" data-k="connect">Connect</a>'
      + '<a href="/blog/" data-k="blog">Blog</a>'
      + '<a href="/press/" data-k="press">Press</a>'
      + '<a href="/faq/" data-k="faq">FAQ</a>'
      + '<a href="/manage-subscription/" data-k="manage-subscription">Manage Subscription</a>'
    + '</div>'
    + '<div class="nav-cta">'
      + '<a class="login-link" href="/login/">Log in</a>'
      + '<span class="store disabled"><span style="font-size:18px">&#63743;</span><span><small>Coming soon</small><b>App Store</b></span></span>'
    + '</div>'
    + '</nav></header>';
  var FOOT =
    '<footer><div class="wrap">'
    + '<div class="foot-top">'
      + '<div style="max-width:300px"><a class="brand" href="/"><img src="/AppIcon-1024.png" alt="BarbellMind" style="width:28px;height:28px;border-radius:7px"/> BarbellMind</a>'
        + '<p style="margin-top:12px;color:var(--muted);font-size:13.5px">AI training and nutrition coach. Coming soon to the App Store.</p></div>'
      + '<div class="foot-col"><h4>Product</h4><a href="/features/">Features</a><a href="/ai-coach/">AI Coach</a><a href="/connect/">Connect</a><a href="/faq/">FAQ</a><a href="/blog/">Blog</a></div>'
      + '<div class="foot-col"><h4>Account</h4><a href="/login/">Log in</a><a href="/manage-subscription/">Manage Subscription</a></div>'
      + '<div class="foot-col"><h4>Company</h4><a href="/press/">Press</a><a href="mailto:lev@obsidiandist.com">Contact</a><a href="/privacy-policy/">Privacy Policy</a></div>'
    + '</div>'
    + '<div class="foot-bottom"><span>&copy; 2026 Obsidian Distribution LLC. All rights reserved.</span><span>BarbellMind</span></div>'
    + '</div></footer>';

  function inject(){
    var n=document.getElementById("site-nav"); if(n) n.innerHTML=NAV;
    var f=document.getElementById("site-footer"); if(f) f.innerHTML=FOOT;
    // active link
    var path=location.pathname.replace(/\/+$/,"/");
    var key=(path.split("/")[1]||"");
    document.querySelectorAll(".nav-links a[data-k]").forEach(function(a){ if(a.getAttribute("data-k")===key) a.classList.add("active"); });
    // mobile toggle
    var t=document.querySelector(".nav-toggle"), links=document.querySelector(".nav-links");
    if(t&&links) t.addEventListener("click",function(){ links.classList.toggle("open"); });
  }

  function wireContact(){
    var form=document.getElementById("contactForm"); if(!form) return;
    form.addEventListener("submit",function(e){
      e.preventDefault();
      var msg=document.getElementById("contactMsg");
      var data={email:form.email.value.trim(),subject:form.subject.value.trim(),message:form.message.value.trim()};
      if(!data.email||!data.message){ msg.className="formmsg err"; msg.textContent="Please add your email and a message."; return; }
      msg.className="formmsg"; msg.textContent="Sending...";
      fetch(FN+"/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)})
        .then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,j:j}})})
        .then(function(res){ if(res.ok){ form.reset(); msg.className="formmsg ok"; msg.textContent="Thanks. Your message was sent. We will get back to you."; } else { msg.className="formmsg err"; msg.textContent=(res.j&&res.j.error)||"Something went wrong. Email lev@obsidiandist.com instead."; } })
        .catch(function(){ msg.className="formmsg err"; msg.textContent="Network error. Email lev@obsidiandist.com instead."; });
    });
  }

  function wireSub(){
    var form=document.getElementById("subForm"); if(!form) return;
    form.addEventListener("submit",function(e){
      e.preventDefault();
      var msg=document.getElementById("subMsg"), box=document.getElementById("subBox");
      var email=form.email.value.trim();
      if(!email){ msg.className="formmsg err"; msg.textContent="Enter your email."; return; }
      msg.className="formmsg"; msg.textContent="Checking..."; box.classList.remove("show");
      fetch(FN+"/sub-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:email})})
        .then(function(r){return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,j:j}})})
        .then(function(res){
          msg.textContent="";
          if(!res.ok){ msg.className="formmsg err"; msg.textContent=(res.j&&res.j.error)||"Could not check right now. Try again later."; return; }
          var j=res.j||{};
          box.innerHTML='<div style="font-weight:800;font-size:15px;margin-bottom:6px">'+(j.title||"Status")+'</div><div style="color:var(--text-2);font-size:14px">'+(j.detail||"")+'</div>';
          box.classList.add("show");
        })
        .catch(function(){ msg.className="formmsg err"; msg.textContent="Network error. Try again later."; });
    });
  }

  if(document.readyState!=="loading"){ inject(); wireContact(); wireSub(); }
  else document.addEventListener("DOMContentLoaded",function(){ inject(); wireContact(); wireSub(); });
})();
