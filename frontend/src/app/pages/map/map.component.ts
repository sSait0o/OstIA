import {
  Component, OnInit, AfterViewInit, OnDestroy,
  ElementRef, ViewChild, inject, signal, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Style, Circle, Fill, Stroke, Text } from 'ol/style';
import Overlay from 'ol/Overlay';
import { MapService, MapApplication } from '../../core/services/map.service';

const STATUS_COLORS: Record<string, string> = {
  APPLIED: '#8c8c8c', ACKNOWLEDGED: '#1890ff', INTERVIEW: '#faad14',
  TECHNICAL: '#722ed1', OFFER: '#52c41a', REJECTED: '#ff4d4f', WITHDRAWN: '#d9d9d9',
};

const STATUS_LABELS: Record<string, string> = {
  APPLIED: 'Envoyée', ACKNOWLEDGED: 'Reçue', INTERVIEW: 'Entretien',
  TECHNICAL: 'Test tech', OFFER: 'Offre', REJECTED: 'Refusé', WITHDRAWN: 'Retirée',
};

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [
    FormsModule, NzTabsModule, NzCardModule, NzTagModule, NzBadgeModule,
    NzButtonModule, NzInputModule, NzIconModule, NzSpinModule, NzEmptyModule,
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private readonly mapService = inject(MapService);
  private readonly message = inject(NzMessageService);

  private olMap?: Map;
  private vectorSource = new VectorSource();
  private popup?: Overlay;

  allApps = signal<MapApplication[]>([]);
  geocoding = signal(false);
  manualLocations: Record<string, string> = {};

  locatedApps = computed(() => this.allApps().filter((a) => a.lat !== null && a.lon !== null));
  unlocatedApps = computed(() => this.allApps().filter((a) => a.lat === null || a.lon === null));

  getStatusColor(status: string) { return STATUS_COLORS[status] ?? 'default'; }
  getStatusLabel(status: string) { return STATUS_LABELS[status] ?? status; }

  ngOnInit() {
    this.mapService.getMapApplications().subscribe({
      next: (apps) => {
        this.allApps.set(apps);
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
    const popupEl = document.createElement('div');
    popupEl.className = 'ol-popup';
    popupEl.style.cssText =
      'background:white;padding:10px 14px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-size:13px;min-width:160px;';

    this.popup = new Overlay({ element: popupEl, positioning: 'bottom-center', offset: [0, -14] });

    this.olMap = new Map({
      target: this.mapContainer.nativeElement,
      layers: [
        new TileLayer({ source: new OSM() }),
        new VectorLayer({
          source: this.vectorSource,
          style: (feature) => this.markerStyle(feature as Feature),
        }),
      ],
      view: new View({ center: fromLonLat([2.3522, 46.5]), zoom: 5.5 }),
      overlays: [this.popup],
    });

    this.olMap.on('click', (evt) => {
      const feature = this.olMap!.forEachFeatureAtPixel(evt.pixel, (f) => f);
      if (feature) {
        const app = (feature as Feature).get('app') as MapApplication;
        popupEl.innerHTML = `
          <strong>${app.company}</strong><br>
          <span style="color:#666">${app.jobTitle}</span><br>
          <span style="color:${STATUS_COLORS[app.status]};font-size:12px">● ${STATUS_LABELS[app.status]}</span><br>
          <span style="color:#999;font-size:11px">${app.resolvedLocation ?? app.location ?? ''}</span>
        `;
        this.popup!.setPosition(evt.coordinate);
      } else {
        this.popup!.setPosition(undefined);
      }
    });

    this.olMap.on('pointermove', (evt) => {
      const hit = this.olMap!.hasFeatureAtPixel(evt.pixel);
      this.mapContainer.nativeElement.style.cursor = hit ? 'pointer' : '';
    });
  }

  private markerStyle(feature: Feature) {
    const app = feature.get('app') as MapApplication;
    const color = STATUS_COLORS[app.status] ?? '#8c8c8c';
    return new Style({
      image: new Circle({
        radius: 10,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#fff', width: 2 }),
      }),
      text: new Text({
        text: app.company.slice(0, 1).toUpperCase(),
        fill: new Fill({ color: '#fff' }),
        font: 'bold 10px sans-serif',
      }),
    });
  }

  private updateMarkers() {
    this.vectorSource.clear();
    const features = this.locatedApps()
      .map((app) => {
        const f = new Feature({ geometry: new Point(fromLonLat([app.lon!, app.lat!])), app });
        return f;
      });
    this.vectorSource.addFeatures(features);
  }

  private geocodeMissing(apps: MapApplication[]) {
    if (apps.length === 0) return;
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
          delete this.manualLocations[app.id];
          this.message.success(`${app.company} localisé sur la carte`);
        } else {
          this.message.error('Localisation introuvable, essayez une adresse plus précise');
        }
      },
    });
  }
}
