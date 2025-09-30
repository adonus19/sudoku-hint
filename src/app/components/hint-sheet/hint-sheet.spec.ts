import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HintSheet } from './hint-sheet';

describe('HintSheet', () => {
  let component: HintSheet;
  let fixture: ComponentFixture<HintSheet>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HintSheet]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HintSheet);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
