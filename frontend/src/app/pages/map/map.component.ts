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
import { NzMessageService } from 'ng-zorro-antd/message';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Style, Circle, Fill, Stroke, Text } from 'ol/style';
import Overlay from 'ol/Overlay';
import { MapService, MapApplication } from '../../core/services/map.service';

const STATUS_COLORS: Record<string, string> = {
  APPLIED: 'rgba(200,200,200,0.9)',
  ACKNOWLEDGED: 'rgba(100,180,255,0.9)',
  TECHNICAL: 'rgba(179,127,235,0.9)',
  INTERVIEW: 'rgba(255,210,80,0.9)',
  OFFER: 'rgba(100,230,120,0.9)',
  REJECTED: 'rgba(255,100,100,0.9)',
};

const STATUS_TAG: Record<string, string> = {
  APPLIED: 'default', ACKNOWLEDGED: 'blue', TECHNICAL: 'purple', INTERVIEW: 'orange',
  OFFER: 'green', REJECTED: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Envoyée', ACKNOWLEDGED: 'Reçue', TECHNICAL: 'Test technique', INTERVIEW: 'Entretien',
  OFFER: 'Offre', REJECTED: 'Refusé',
};

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    DatePipe, FormsModule, NzModalModule,
    NzCardModule, NzTagModule, NzButtonModule, NzInputModule,
    NzIconModule, NzSpinModule, NzEmptyModule,
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private readonly mapService = inject(MapService);
  private readonly message = inject(NzMessageService);
  private readonly sanitizer = inject(DomSanitizer);

  private olMap?: Map;
  private vectorSource = new VectorSource();
  private tooltip?: Overlay;
  private tooltipEl!: HTMLDivElement;

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

  getStatusTag(s: string) { return STATUS_TAG[s] ?? 'default'; }
  getStatusLabel(s: string) { return STATUS_LABELS[s] ?? s; }

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
        this.geocodeMissing(apps.filter((a) => a.lat === null));
      },
    });
  }

  ngAfterViewInit() {
    this.initMap();
  }

  ngOnDestroy() {
    this.olMap?.setTarget(undefined);
  }

  private initMap() {
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText =
      'background:#fff;border:1px solid rgba(0,0,0,0.1);padding:8px 12px;border-radius:8px;' +
      'font-size:12px;color:#1a1a1a;pointer-events:none;white-space:nowrap;display:none;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.15);';
    this.tooltip = new Overlay({ element: this.tooltipEl, offset: [12, 0], positioning: 'center-left' });

    this.olMap = new Map({
      target: this.mapContainer.nativeElement,
      controls: [],
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            attributions: '© CARTO © OpenStreetMap',
          }),
        }),
        new VectorLayer({
          source: this.vectorSource,
          style: (f) => this.markerStyle(f as Feature),
        }),
      ],
      view: new View({ center: fromLonLat([2.3522, 46.5]), zoom: 5.5 }),
      overlays: [this.tooltip!],
    });

    this.olMap.on('click', (evt) => {
      const feature = this.olMap!.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature) {
        const app = (feature as Feature).get('app') as MapApplication;
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
      }
    });

    this.olMap.on('pointermove', (evt) => {
      const feature = this.olMap!.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature) {
        const app = (feature as Feature).get('app') as MapApplication;
        const label = STATUS_LABELS[app.status] ?? app.status;
        this.tooltipEl.innerHTML =
          `<strong style="color:#1a1a1a">${app.company}</strong><br>` +
          `<span style="color:rgba(0,0,0,0.45)">${app.jobTitle}</span><br>` +
          `<span style="color:${STATUS_COLORS[app.status]};font-size:11px">● ${label}</span>`;
        this.tooltipEl.style.display = 'block';
        this.tooltip!.setPosition(evt.coordinate);
        this.mapContainer.nativeElement.style.cursor = 'pointer';
      } else {
        this.tooltipEl.style.display = 'none';
        this.tooltip!.setPosition(undefined);
        this.mapContainer.nativeElement.style.cursor = '';
      }
    });
  }

  private markerStyle(feature: Feature) {
    const app = feature.get('app') as MapApplication;
    const color = STATUS_COLORS[app.status] ?? 'rgba(200,200,200,0.9)';
    return new Style({
      image: new Circle({
        radius: 10,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: 'rgba(0,0,0,0.6)', width: 2 }),
      }),
      text: new Text({
        text: app.company.slice(0, 1).toUpperCase(),
        fill: new Fill({ color: '#000' }),
        font: 'bold 10px sans-serif',
      }),
    });
  }

  private updateMarkers() {
    this.vectorSource.clear();
    const features = this.locatedApps().map((app) =>
      new Feature({ geometry: new Point(fromLonLat([app.lon!, app.lat!])), app }),
    );
    this.vectorSource.addFeatures(features);
  }

  private geocodeMissing(apps: MapApplication[]) {
    if (!apps.length) return;
    this.geocoding.set(true);
    let remaining = apps.length;
    for (const app of apps) {
      this.mapService.geocode(app.company, app.jobTitle, app.location ?? '').subscribe({
        next: (result) => {
          if (result.lat !== null && result.lon !== null) {
            this.mapService.saveCoordinates(app.id, result.lat, result.lon, result.resolvedLocation ?? '').subscribe();
            this.allApps.update((list) =>
              list.map((a) => a.id === app.id
                ? { ...a, lat: result.lat, lon: result.lon, resolvedLocation: result.resolvedLocation }
                : a,
              ),
            );
            this.updateMarkers();
          }
          if (--remaining === 0) this.geocoding.set(false);
        },
        error: () => { if (--remaining === 0) this.geocoding.set(false); },
      });
    }
  }

  saveManualLocation(app: MapApplication) {
    const locationStr = this.manualLocations[app.id];
    if (!locationStr) return;
    this.mapService.geocode(app.company, app.jobTitle, locationStr).subscribe({
      next: (result) => {
        if (result.lat !== null && result.lon !== null) {
          this.mapService.saveCoordinates(app.id, result.lat, result.lon, result.resolvedLocation ?? locationStr).subscribe();
          this.allApps.update((list) =>
            list.map((a) => a.id === app.id
              ? { ...a, lat: result.lat, lon: result.lon, resolvedLocation: result.resolvedLocation, location: locationStr }
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
