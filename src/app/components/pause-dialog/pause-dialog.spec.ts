import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PauseDialog } from './pause-dialog';

describe('PauseDialog', () => {
  let component: PauseDialog;
  let fixture: ComponentFixture<PauseDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PauseDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PauseDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
