import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, inject, signal, computed, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzToolTipModule } from 'ng-zorro-antd/tooltip';
import { NzMessageService } from 'ng-zorro-antd/message';
import { from, of } from 'rxjs';
import { mergeMap, map, catchError, timeout, finalize } from 'rxjs/operators';
import OlMap from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Cluster from 'ol/source/Cluster';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Coordinate } from 'ol/coordinate';
import { fromLonLat } from 'ol/proj';
import { easeOut } from 'ol/easing';
import { Style, Circle, Fill, Stroke, Text } from 'ol/style';
import Overlay from 'ol/Overlay';
import { MapService, MapApplication } from '@core/services/map.service';
import { getStatusTag, getStatusLabel, getStatusMarkerColor } from '@shared/utils/status-colors.utils';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    DatePipe, FormsModule, NzModalModule,
    NzCardModule, NzTagModule, NzButtonModule, NzInputModule,
    NzIconModule, NzSpinModule, NzEmptyModule, NzToolTipModule,
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private readonly mapService = inject(MapService);
  private readonly message = inject(NzMessageService);
  private readonly sanitizer = inject(DomSanitizer);

  private olMap?: OlMap;
  private clusterLayer?: VectorLayer;
  private vectorSource = new VectorSource();
  private clusterSource = new Cluster({ distance: 45, source: this.vectorSource });
  private tooltip?: Overlay;
  private pulseFrame?: number;
  private tooltipEl!: HTMLDivElement;

  private static readonly SPLIT_DURATION = 700;
  private prevClusterSnapshot = new Map<string, Coordinate>();
  private splitAnimations = new Map<string, { from: Coordinate; to: Coordinate; start: number }>();

  allApps = signal<MapApplication[]>([]);
  geocoding = signal(false);
  activeTab = signal<'map' | 'unlocated'>('map');
  manualLocations: Record<string, string> = {};
  drawerVisible = false;
  drawerCity = '';
  drawerApps: MapApplication[] = [];
  emailModalVisible = false;
  emailApp: MapApplication | null = null;

  private inFrance(lat: number, lon: number) {
    return lat >= 41.3 && lat <= 51.1 && lon >= -5.1 && lon <= 9.6;
  }

  locatedApps = computed(() =>
    this.allApps().filter((a) => a.lat !== null && a.lon !== null && this.inFrance(a.lat!, a.lon!)),
  );

  unlocatedApps = computed(() =>
    this.allApps().filter((a) => a.lat === null || a.lon === null || !this.inFrance(a.lat!, a.lon!)),
  );

  cityGroups = computed(() => {
    const groups: Record<string, MapApplication[]> = {};
    for (const app of this.locatedApps()) {
      const city = app.resolvedLocation ?? app.location ?? 'Inconnue';
      if (!groups[city]) groups[city] = [];
      groups[city].push(app);
    }
    return Object.entries(groups)
      .map(([city, apps]) => ({ city, apps }))
      .sort((a, b) => b.apps.length - a.apps.length);
  });

  getStatusTag = getStatusTag;
  getStatusLabel = getStatusLabel;

  private shortCity(location: string): string {
    return location.split(',')[0].trim();
  }

  openEmail(app: MapApplication) {
    this.emailApp = app;
    this.emailModalVisible = true;
  }

  get safeEmailHtml(): string {
    return this.sanitizer.sanitize(SecurityContext.HTML, this.emailApp?.emailBody ?? '') ?? '';
  }

  isHtml(body: string | null): boolean {
    return !!body && /<[a-z][\s\S]*>/i.test(body);
  }

  ngOnInit() {
    this.mapService.getMapApplications().subscribe({
      next: (apps) => {
        this.allApps.set(apps);
        this.mapService.unlocatedCount.set(this.unlocatedApps().length);
        this.updateMarkers();
        this.geocodeMissing(this.unlocatedApps());
      },
    });
  }

  ngAfterViewInit() {
    this.initMap();
    this.startPulseLoop();
  }

  ngOnDestroy() {
    if (this.pulseFrame !== undefined) cancelAnimationFrame(this.pulseFrame);
    this.olMap?.setTarget(undefined);
  }

  private startPulseLoop() {
    const loop = () => {
      this.clusterLayer?.changed();
      this.pulseFrame = requestAnimationFrame(loop);
    };
    this.pulseFrame = requestAnimationFrame(loop);
  }

  private pulsePhase(period = 1600): number {
    return (Date.now() % period) / period;
  }

  private initMap() {
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText =
      'background:rgba(10,10,10,0.85);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);' +
      'padding:8px 12px;border-radius:8px;font-size:12px;color:#fff;pointer-events:none;white-space:nowrap;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.35);opacity:0;transform:translateY(2px) scale(0.96);' +
      'transition:opacity 0.12s ease-out, transform 0.12s ease-out;';
    this.tooltip = new Overlay({ element: this.tooltipEl, offset: [12, 0], positioning: 'center-left' });

    this.clusterLayer = new VectorLayer({
      source: this.clusterSource,
      style: (f) => this.clusterStyle(f as Feature),
    });

    this.olMap = new OlMap({
      target: this.mapContainer.nativeElement,
      controls: [],
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            attributions: '© CARTO © OpenStreetMap',
          }),
        }),
        this.clusterLayer,
      ],
      view: new View({ center: fromLonLat([2.3522, 46.5]), zoom: 5.5, minZoom: 4.5, maxZoom: 18 }),
      overlays: [this.tooltip!],
    });

    this.clusterSource.on('change', () => this.trackClusterSplit());

    this.olMap.on('click', (evt) => {
      const feature = this.olMap!.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (!feature) return;
      const clustered = feature.get('features') as Feature[];

      if (clustered.length === 1) {
        const app = clustered[0].get('app') as MapApplication;
        const city = app.resolvedLocation ?? app.location ?? 'Inconnue';
        const group = this.cityGroups().find((g) => g.city === city);
        if (group) {
          this.drawerCity = this.shortCity(group.city);
          this.drawerApps = group.apps;
        } else {
          this.drawerCity = this.shortCity(city);
          this.drawerApps = [app];
        }
        this.drawerVisible = true;
        return;
      }

      const apps = clustered.map((f) => f.get('app') as MapApplication);
      const cities = new Set(apps.map((a) => a.resolvedLocation ?? a.location ?? 'Inconnue'));
      if (cities.size === 1) {
        this.drawerCity = this.shortCity([...cities][0]);
        this.drawerApps = apps;
        this.drawerVisible = true;
      } else {
        const view = this.olMap!.getView();
        view.animate({ zoom: (view.getZoom() ?? 5.5) + 2, center: evt.coordinate, duration: 250 });
      }
    });

    this.olMap.on('pointermove', (evt) => {
      const feature = this.olMap!.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature) {
        const clustered = feature.get('features') as Feature[];
        if (clustered.length === 1) {
          const app = clustered[0].get('app') as MapApplication;
          const label = getStatusLabel(app.status);
          this.tooltipEl.innerHTML =
            `<strong style="color:#fff">${app.company}</strong><br>` +
            `<span style="color:rgba(255,255,255,0.5)">${app.jobTitle}</span><br>` +
            `<span style="color:${getStatusMarkerColor(app.status)};font-size:11px">● ${label}</span>`;
        } else {
          const apps = clustered.map((f) => f.get('app') as MapApplication);
          const cities = new Set(apps.map((a) => a.resolvedLocation ?? a.location ?? 'Inconnue'));
          const cityLabel = cities.size === 1 ? this.shortCity([...cities][0]) : `${cities.size} villes`;
          this.tooltipEl.innerHTML =
            `<strong style="color:#fff">${clustered.length} candidatures</strong><br>` +
            `<span style="color:rgba(255,255,255,0.5)">${cityLabel}</span>`;
        }
        this.tooltipEl.style.opacity = '1';
        this.tooltipEl.style.transform = 'translateY(0) scale(1)';
        this.tooltip!.setPosition(evt.coordinate);
        this.mapContainer.nativeElement.style.cursor = 'pointer';
      } else {
        this.tooltipEl.style.opacity = '0';
        this.tooltipEl.style.transform = 'translateY(2px) scale(0.96)';
        this.tooltip!.setPosition(undefined);
        this.mapContainer.nativeElement.style.cursor = '';
      }
    });
  }

  private static readonly MARKER_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  private clusterKey(clustered: Feature[]): string {
    return clustered.map((f) => (f.get('app') as MapApplication).id).sort().join(',');
  }

  private trackClusterSplit() {
    const features = this.clusterSource.getFeatures();
    if (features.length === 0 && this.prevClusterSnapshot.size > 0) return;

    const now = performance.now();
    const nextSnapshot = new Map<string, Coordinate>();

    for (const feature of features) {
      const clustered = feature.get('features') as Feature[];
      const key = this.clusterKey(clustered);
      const coord = (feature.getGeometry() as Point).getCoordinates();
      nextSnapshot.set(key, coord);

      if (this.prevClusterSnapshot.has(key)) continue;

      let bestOverlap = 0;
      let bestFrom: Coordinate | null = null;
      for (const [prevKey, prevCoord] of this.prevClusterSnapshot) {
        const prevMembers = new Set(prevKey.split(','));
        const overlap = clustered.reduce(
          (n, f) => n + (prevMembers.has((f.get('app') as MapApplication).id) ? 1 : 0),
          0,
        );
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestFrom = prevCoord;
        }
      }
      if (bestFrom && (bestFrom[0] !== coord[0] || bestFrom[1] !== coord[1])) {
        this.splitAnimations.set(key, { from: bestFrom, to: coord, start: now });
      }
    }

    this.prevClusterSnapshot = nextSnapshot;
  }

  private animatedCoordinate(key: string, trueCoord: Coordinate): Coordinate {
    const anim = this.splitAnimations.get(key);
    if (!anim) return trueCoord;

    const elapsed = performance.now() - anim.start;
    if (elapsed >= MapComponent.SPLIT_DURATION) {
      this.splitAnimations.delete(key);
      return trueCoord;
    }

    const t = easeOut(elapsed / MapComponent.SPLIT_DURATION);
    return [
      anim.from[0] + (anim.to[0] - anim.from[0]) * t,
      anim.from[1] + (anim.to[1] - anim.from[1]) * t,
    ];
  }

  private static readonly SINGLE_REVEAL_ZOOM = 9;

  private clusterStyle(feature: Feature) {
    const clustered = feature.get('features') as Feature[];
    const key = this.clusterKey(clustered);
    const trueCoord = (feature.getGeometry() as Point).getCoordinates();
    const coord = this.animatedCoordinate(key, trueCoord);
    const zoom = this.olMap?.getView().getZoom() ?? 0;

    if (clustered.length === 1 && zoom >= MapComponent.SINGLE_REVEAL_ZOOM) {
      return this.markerStyle(clustered[0], coord);
    }

    return this.badgeStyle(clustered.length, coord);
  }

  private badgeStyle(count: number, coord: Coordinate) {
    const radius = Math.min(14 + Math.sqrt(count) * 4, 26);
    const t = this.pulsePhase();
    const point = new Point(coord);

    return [
      new Style({
        geometry: point,
        image: new Circle({
          radius: radius + t * 14,
          fill: new Fill({ color: `rgba(90,200,250,${0.28 * (1 - t)})` }),
        }),
      }),
      new Style({
        geometry: point,
        image: new Circle({
          radius,
          fill: new Fill({ color: 'rgba(13,13,13,0.92)' }),
          stroke: new Stroke({ color: 'rgba(90,200,250,0.95)', width: 2 }),
        }),
        text: new Text({
          text: String(count),
          fill: new Fill({ color: '#fff' }),
          font: `700 12px ${MapComponent.MARKER_FONT}`,
        }),
      }),
    ];
  }

  private markerStyle(feature: Feature, coord: Coordinate) {
    const app = feature.get('app') as MapApplication;
    const color = getStatusMarkerColor(app.status);
    const t = this.pulsePhase();
    const point = new Point(coord);

    return [
      new Style({
        geometry: point,
        image: new Circle({
          radius: 9 + t * 9,
          fill: new Fill({ color: getStatusMarkerColor(app.status, 0.3 * (1 - t)) }),
        }),
      }),
      new Style({
        geometry: point,
        image: new Circle({
          radius: 9,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: 'rgba(255,255,255,0.85)', width: 1.5 }),
        }),
        text: new Text({
          text: app.company.slice(0, 1).toUpperCase(),
          fill: new Fill({ color: '#fff' }),
          font: `700 10px ${MapComponent.MARKER_FONT}`,
        }),
      }),
    ];
  }

  private updateMarkers() {
    this.vectorSource.clear();
    const features = this.locatedApps().map((app) =>
      new Feature({ geometry: new Point(fromLonLat([app.lon!, app.lat!])), app }),
    );
    this.vectorSource.addFeatures(features);
  }

  private findKnownCoordinates(company: string) {
    const normalized = company.trim().toLowerCase();
    const match = this.allApps().find(
      (a) => a.company.trim().toLowerCase() === normalized && a.lat !== null && a.lon !== null,
    );
    return match ? { lat: match.lat, lon: match.lon, resolvedLocation: match.resolvedLocation } : null;
  }

  private geocodeMissing(apps: MapApplication[]) {
    if (!apps.length) return;
    console.log(`[map] géocodage de ${apps.length} candidature(s) sans coordonnées`, apps.map((a) => a.company));
    this.geocoding.set(true);

    from(apps)
      .pipe(
        mergeMap((app) => {
          const known = this.findKnownCoordinates(app.company);
          if (known) {
            console.log(`[map] ${app.company} : coordonnées déjà connues (autre candidature)`, known);
            return of({ app, result: known });
          }
          console.log(`[map] ${app.company} (${app.jobTitle}) : appel geocode...`);
          return this.mapService.geocode(app.company, app.jobTitle, app.location ?? '').pipe(
            timeout(20000),
            map((result) => ({ app, result })),
            catchError((err) => {
              console.warn(`[map] ${app.company} : échec du geocode`, err);
              return of({ app, result: null });
            }),
          );
        }, 3),
        finalize(() => {
          this.geocoding.set(false);
          console.log('[map] géocodage terminé');
        }),
      )
      .subscribe(({ app, result }) => {
        if (result && result.lat !== null && result.lon !== null) {
          const confidence = 'confidence' in result ? result.confidence : 'known';
          console.log(`[map] ${app.company} : localisé via "${confidence}"`, result);
          const jobUrl = 'jobUrl' in result && !app.jobUrl ? (result.jobUrl ?? undefined) : undefined;
          this.mapService
            .saveCoordinates(app.id, result.lat, result.lon, result.resolvedLocation ?? '', jobUrl)
            .subscribe();
          this.allApps.update((list) =>
            list.map((a) => a.id === app.id
              ? {
                  ...a,
                  lat: result.lat,
                  lon: result.lon,
                  resolvedLocation: result.resolvedLocation,
                  jobUrl: jobUrl ?? a.jobUrl,
                }
              : a,
            ),
          );
          this.updateMarkers();
        } else {
          console.log(`[map] ${app.company} : aucune localisation trouvée`);
        }
      });
  }

  saveManualLocation(app: MapApplication) {
    const locationStr = this.manualLocations[app.id];
    if (!locationStr) return;
    this.mapService.geocode(app.company, app.jobTitle, locationStr).subscribe({
      next: (result) => {
        if (result.lat !== null && result.lon !== null) {
          const jobUrl = !app.jobUrl ? (result.jobUrl ?? undefined) : undefined;
          this.mapService
            .saveCoordinates(app.id, result.lat, result.lon, result.resolvedLocation ?? locationStr, jobUrl)
            .subscribe();
          this.allApps.update((list) =>
            list.map((a) => a.id === app.id
              ? {
                  ...a,
                  lat: result.lat,
                  lon: result.lon,
                  resolvedLocation: result.resolvedLocation,
                  location: locationStr,
                  jobUrl: jobUrl ?? a.jobUrl,
                }
              : a,
            ),
          );
          this.updateMarkers();
          this.mapService.unlocatedCount.set(this.unlocatedApps().length);
          delete this.manualLocations[app.id];
          this.message.success(`${app.company} localisé`);
        } else {
          this.message.error('Localisation introuvable');
        }
      },
    });
  }
}
