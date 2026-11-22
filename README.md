# Baliza

Escondite urbano multijugador en tiempo real sobre el mapa (PWA).

## Despliegue automático en GitHub Pages

Este repositorio ya incluye el flujo automático de **GitHub Actions** para compilar y publicar la aplicación cada vez que subas cambios a `main` o `master`.

1. Sube el proyecto a tu repositorio de GitHub.
2. En GitHub, entra en **Settings → Pages**.
3. En **Build and deployment → Source**, elige **GitHub Actions**.
4. Cada push actualizará la web automáticamente usando la ruta del repositorio como base.

## Multijugador entre móviles (opcional con Supabase)

Sin configuración extra funciona en modo local entre pestañas del navegador. Para jugar desde distintos móviles por internet:

1. Crea un proyecto gratuito en Supabase y ejecuta el SQL de la carpeta `supabase`.
2. En tu repositorio de GitHub, ve a **Settings → Secrets and variables → Actions** y añade como *Variables* (o *Secrets*):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Lanza de nuevo el workflow (o haz un push) para que el despliegue incluya esas variables.
