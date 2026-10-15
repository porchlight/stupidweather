[1mdiff --git a/index.html b/index.html[m
[1mindex 8fdd53b..d5e5e9f 100644[m
[1m--- a/index.html[m
[1m+++ b/index.html[m
[36m@@ -1,10 +1,12 @@[m
 <!DOCTYPE html>[m
 <html lang="en">[m
[32m+[m
 <head>[m
   <meta charset="utf-8">[m
   <meta name="viewport" content="width=device-width, initial-scale=1">[m
   <title>Stupid Weather</title>[m
[31m-  <meta name="description" content="Stupid Weather shows hourly and 7-day forecasts plus live radar for any city, with no accounts and no nonsense.">[m
[32m+[m[32m  <meta name="description"[m
[32m+[m[32m    content="Stupid Weather shows hourly and 7-day forecasts plus live radar for any city, with no accounts and no nonsense.">[m
   <meta name="theme-color" content="#6a4c93">[m
   <meta property="og:title" content="Stupid Weather">[m
   <meta property="og:description" content="Hourly and 7-day forecasts plus live radar for any city.">[m
[36m@@ -19,7 +21,8 @@[m
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">[m
   <link rel="preconnect" href="https://fonts.googleapis.com">[m
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>[m
[31m-  <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">[m
[32m+[m[32m  <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@400;700;800&display=swap"[m
[32m+[m[32m    rel="stylesheet">[m
   <link rel="stylesheet" href="styles.css">[m
   <script type="application/ld+json">[m
     {[m
[36m@@ -32,12 +35,13 @@[m
     }[m
   </script>[m
 </head>[m
[32m+[m
 <body>[m
   <header>[m
     <h1>Stupid Weather</h1>[m
     <form id="locationForm">[m
       <label for="locationInput">City</label>[m
[31m-      <input id="locationInput" placeholder="e.g. Toronto, Ontario" required>[m
[32m+[m[32m      <input id="locationInput" placeholder="e.g. London, Ontario" required>[m
       <button type="submit">Search</button>[m
     </form>[m
     <div id="results" hidden></div>[m
[36m@@ -67,4 +71,5 @@[m
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>[m
   <script type="module" src="app.js"></script>[m
 </body>[m
[32m+[m
 </html>[m
