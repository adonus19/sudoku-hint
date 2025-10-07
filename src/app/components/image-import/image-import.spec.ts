import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageImport } from './image-import';

describe('ImageImport', () => {
  let component: ImageImport;
  let fixture: ComponentFixture<ImageImport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageImport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImageImport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
