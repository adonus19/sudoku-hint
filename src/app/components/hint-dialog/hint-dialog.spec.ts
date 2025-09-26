import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HintDialog } from './hint-dialog';

describe('HintDialog', () => {
  let component: HintDialog;
  let fixture: ComponentFixture<HintDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HintDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HintDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
